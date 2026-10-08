"""Deployable Mirror frontier worker built on the surviving Python core.

The service is intentionally provider-neutral. A configured reasoning endpoint drives
tool use; Mirror supplies persistence, research, coding, local Git/workspace tools,
and bounded execution. Remote Git mutation and canonical Automate mutation are never
exposed.

Run with:
    python -m mirror_lab.frontier_service

Environment:
    MIRROR_FRONTIER_JOB_TOKEN
    MIRROR_AI_ENDPOINT
    MIRROR_AI_TOKEN (optional)
    MIRROR_AI_MODEL (optional)
    MIRROR_STATE_DIR (optional)
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path, PurePosixPath
from typing import Any, Mapping

from .ai_provider import AIProviderError, AIResponse, complete
from .builtin_tools import build_default_tool_registry
from .mirror_ai import MirrorAI, MirrorAIConfig
from .reasoning import SpecialistName
from .tooling import ToolContext, ToolSpec


MAX_BODY_BYTES = 2_000_000
MAX_DIFF_BYTES = 1_500_000
MAX_TOOL_STEPS = 32
MAX_CHANGED_FILES = 20

SCHEMA_VERSION = "mirror.frontier_job.v1"
RESULT_SCHEMA_VERSION = "mirror.frontier_result.v1"


def _record(value: Any) -> Mapping[str, Any] | None:
    return value if isinstance(value, Mapping) else None


def _validate_job(job: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(job, Mapping):
        return ["frontier job must be a JSON object"]
    if job.get("schema_version") != SCHEMA_VERSION:
        errors.append("invalid frontier job schema")
    capability = _record(job.get("capability"))
    if capability is None:
        errors.append("frontier job missing capability")
    else:
        revision = str(capability.get("base_revision") or "")
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            errors.append("capability.base_revision must be an exact lowercase 40-character SHA")
    permissions = _record(job.get("permissions"))
    if permissions is None:
        errors.append("frontier job missing permissions")
    else:
        if permissions.get("remote_git_mutation") is not False:
            errors.append("remote Git mutation is forbidden")
        if permissions.get("canonical_mutation") is not False:
            errors.append("canonical mutation is forbidden")
    limits = _record(job.get("limits"))
    if limits is None:
        errors.append("frontier job missing limits")
    else:
        if not 1 <= int(limits.get("max_tool_steps", 0)) <= MAX_TOOL_STEPS:
            errors.append("max_tool_steps exceeds bounded frontier limit")
        if not 1_000 <= int(limits.get("deadline_ms", 0)) <= 900_000:
            errors.append("deadline_ms exceeds bounded frontier limit")
        if not 65_536 <= int(limits.get("max_response_bytes", 0)) <= MAX_BODY_BYTES:
            errors.append("max_response_bytes exceeds bounded frontier limit")
    return errors


def _run_git(root: Path, args: list[str], *, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _clone_exact_revision(repository: str, revision: str, root: Path) -> None:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise RuntimeError("repository must be an owner/name pair")
    init = _run_git(root, ["init"], timeout=60)
    if init.returncode != 0:
        raise RuntimeError("git init failed: " + init.stderr[-4000:])
    add = _run_git(root, ["remote", "add", "origin", f"https://github.com/{repository}.git"], timeout=60)
    if add.returncode != 0:
        raise RuntimeError("git remote setup failed: " + add.stderr[-4000:])
    fetch = _run_git(root, ["fetch", "--depth", "1", "origin", revision], timeout=180)
    if fetch.returncode != 0:
        raise RuntimeError("exact revision fetch failed: " + fetch.stderr[-5000:])
    checkout = _run_git(root, ["checkout", "--detach", revision], timeout=60)
    if checkout.returncode != 0:
        raise RuntimeError("exact revision checkout failed: " + checkout.stderr[-5000:])


def _load_capability_boundary(root: Path, capability_id: str) -> tuple[list[str], set[str], dict[str, Any]]:
    inventory_path = root / "docs" / "CAPABILITY_INVENTORY.json"
    data = json.loads(inventory_path.read_text(encoding="utf-8"))
    if not isinstance(data, Mapping):
        raise RuntimeError("Automate capability inventory is not an object")
    item = next((x for x in data.get("capabilities", []) if isinstance(x, Mapping) and x.get("id") == capability_id), None)
    if not isinstance(item, Mapping):
        raise RuntimeError("capability is not present in the exact-revision inventory")
    allowed = [str(x) for x in item.get("canonical_files", []) if str(x).strip()]
    if not allowed:
        raise RuntimeError("capability has no canonical file boundary")
    policy = data.get("branch_policy", {})
    shared = [str(x) for x in (policy.get("shared_integration_files", []) if isinstance(policy, Mapping) else [])]
    forbidden = {
        "docs/PROJECT_PHASE_LEDGER.md",
        "docs/CAPABILITY_INVENTORY.json",
        "schemas/automate-capability-inventory-v1.json",
        *shared,
    }
    return allowed, forbidden, dict(item)


def _under_prefix(path: str, prefixes: list[str]) -> bool:
    normalized = str(PurePosixPath(path))
    for prefix in prefixes:
        clean = prefix.rstrip("/")
        if normalized == clean:
            return True
        if PurePosixPath(clean).suffix == "" and normalized.startswith(clean + "/"):
            return True
    return False


def _safe_workspace_runner(root: Path) -> ToolSpec:
    def handler(value: Any, _context: Any) -> dict[str, Any]:
        if not isinstance(value, Mapping):
            raise ValueError("workspace.run_safe expects an object")
        raw = value.get("command")
        if not isinstance(raw, list) or not raw or any(not isinstance(x, str) or not x for x in raw):
            raise ValueError("command must be a non-empty argv list")
        command = [str(x) for x in raw]
        if command[:3] == ["python", "-m", "pytest"]:
            targets = command[3:]
            if not targets or any(
                not x.startswith("tests/")
                or ".." in PurePosixPath(x).parts
                or x.startswith("-")
                for x in targets
            ):
                raise ValueError("pytest is restricted to explicit tests/* targets")
        elif command[:3] == ["python", "-m", "compileall"]:
            if len(command) != 4 or not command[3].startswith("."):
                raise ValueError("compileall is restricted to the local checkout")
        elif command[:2] == ["python", "-m"]:
            module = command[2] if len(command) > 2 else ""
            if module not in {"automate.cli"}:
                raise ValueError("only automate.cli is available as a Python module check")
        else:
            raise ValueError("unsupported safe workspace command")
        timeout = max(1, min(int(value.get("timeout_seconds", 300)), 300))
        completed = subprocess.run(
            command,
            cwd=root,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return {
            "command": command,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-100_000:],
            "stderr": completed.stderr[-100_000:],
        }

    return ToolSpec(
        name="workspace.run_safe",
        specialist=SpecialistName.CODING,
        handler=handler,
        description="Run one bounded local test or static-check command. No shell, network, or Git mutation.",
        timeout_seconds=300.0,
        authorization_required=True,
        mutating=True,
    )


def _tool_schemas(registry) -> list[dict[str, Any]]:
    schemas: dict[str, dict[str, Any]] = {
        "automate.frontier.read": {
            "type": "object",
            "properties": {"repository": {"type": "string"}, "revision": {"type": "string"}},
        },
        "research.search": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "providers": {"type": "array", "items": {"type": "string"}},
                "limit_per_provider": {"type": "integer"},
            },
            "required": ["query"],
        },
        "research.fetch": {
            "type": "object",
            "properties": {"locator": {"type": "string"}, "max_bytes": {"type": "integer"}},
            "required": ["locator"],
        },
        "workspace.read": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
        "workspace.write": {
            "type": "object",
            "properties": {"path": {"type": "string"}, "content": {"type": "string"}, "overwrite": {"type": "boolean"}},
            "required": ["path", "content"],
        },
        "workspace.run_safe": {
            "type": "object",
            "properties": {"command": {"type": "array", "items": {"type": "string"}}, "timeout_seconds": {"type": "integer"}},
            "required": ["command"],
        },
        "git.status": {"type": "object", "properties": {}},
        "git.diff": {"type": "object", "properties": {}},
        "git.branch": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        "git.commit": {"type": "object", "properties": {"message": {"type": "string"}}, "required": ["message"]},
    }
    result = []
    for item in registry.manifest():
        name = str(item["name"])
        result.append({
            "type": "function",
            "function": {
                "name": name,
                "description": str(item["description"]),
                "parameters": schemas.get(name, {"type": "object", "properties": {}}),
            },
        })
    return result


def _assistant_message(response: AIResponse) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": response.content}
    if response.tool_calls:
        message["tool_calls"] = [
            {
                "id": call["id"],
                "type": "function",
                "function": {
                    "name": call["name"],
                    "arguments": json.dumps(call["arguments"], ensure_ascii=False, separators=(",", ":")),
                },
            }
            for call in response.tool_calls
        ]
    return message


def _changed_files(root: Path) -> list[str]:
    status = _run_git(root, ["status", "--porcelain", "--untracked-files=all"])
    if status.returncode != 0:
        raise RuntimeError("git status failed: " + status.stderr[-4000:])
    untracked = []
    for line in status.stdout.splitlines():
        if len(line) >= 3 and line[:2] == "??":
            untracked.append(line[3:].strip())
    if untracked:
        add_intent = _run_git(root, ["add", "-N", "--", *untracked], timeout=60)
        if add_intent.returncode != 0:
            raise RuntimeError("git intent-to-add failed: " + add_intent.stderr[-4000:])
    diff_names = _run_git(root, ["diff", "--name-only"], timeout=60)
    if diff_names.returncode != 0:
        raise RuntimeError("git diff name inspection failed: " + diff_names.stderr[-4000:])
    return [line.strip() for line in diff_names.stdout.splitlines() if line.strip()]


def _diff(root: Path) -> str:
    result = _run_git(root, ["diff", "--binary", "--no-ext-diff", "--"], timeout=120)
    if result.returncode != 0:
        raise RuntimeError("git diff failed: " + result.stderr[-4000:])
    diff = result.stdout
    if len(diff.encode("utf-8")) > MAX_DIFF_BYTES:
        raise RuntimeError("frontier diff exceeds bounded result size")
    return diff


def run_frontier_job(job: Mapping[str, Any]) -> dict[str, Any]:
    errors = _validate_job(job)
    if errors:
        return {
            "schema_version": RESULT_SCHEMA_VERSION,
            "authority": "UNTRUSTED_MIRROR_PROPOSAL",
            "status": "FRONTIER_FAILED",
            "error": "; ".join(errors),
        }
    capability = _record(job.get("capability"))
    mission = _record(job.get("mission")) or {}
    limits = _record(job.get("limits")) or {}
    permissions = _record(job.get("permissions")) or {}
    assert capability is not None

    if not os.getenv("MIRROR_AI_ENDPOINT", "").strip():
        return {
            "schema_version": RESULT_SCHEMA_VERSION,
            "authority": "UNTRUSTED_MIRROR_PROPOSAL",
            "request_id": str(job.get("request_id")),
            "action_cycle_id": str(job.get("action_cycle_id")),
            "correlation_id": str((_record(job.get("provenance")) or {}).get("correlation_id") or ""),
            "capability_id": str(capability.get("id")),
            "base_revision": str(capability.get("base_revision")),
            "status": "NO_CHANGE_PROPOSED",
            "proposal": {
                "summary": "Mirror reasoning provider is not configured.",
                "diff": {"stdout": ""},
            },
            "tests": [],
            "unresolved": ["MIRROR_AI_ENDPOINT is not configured"],
            "provenance": {"source_repo": "rynahmed101-sys/the-mirror", "source_component": "python-frontier-worker"},
        }

    repository = str(job.get("target", {}).get("repository") or "rynahmed101-sys/automate")
    capability_id = str(capability.get("id"))
    base_revision = str(capability.get("base_revision"))
    max_steps = min(int(limits.get("max_tool_steps", 8)), MAX_TOOL_STEPS)

    workdir = Path(tempfile.mkdtemp(prefix="mirror-frontier-"))
    state_dir = Path(os.getenv("MIRROR_STATE_DIR", ".mirror_state"))
    trace: list[dict[str, Any]] = []
    final_response = ""
    try:
        _clone_exact_revision(repository, base_revision, workdir)
        allowed, forbidden, item = _load_capability_boundary(workdir, capability_id)

        mirror = MirrorAI(MirrorAIConfig(state_dir=state_dir, workspace_root=workdir))
        registry = build_default_tool_registry(workspace_root=workdir)
        # The worker returns a reviewable diff, so local Git history mutation is
        # deliberately unavailable even inside the temporary checkout.
        registry.unregister("workspace.run")
        registry.unregister("git.branch")
        registry.unregister("git.commit")
        registry.register(_safe_workspace_runner(workdir))
        if not bool(permissions.get("workspace_write", False)):
            registry.unregister("workspace.write")
            registry.unregister("workspace.run_safe")
            registry.unregister("git.branch")
            registry.unregister("git.commit")
        if not bool(permissions.get("network", False)):
            registry.unregister("research.search")
            registry.unregister("research.fetch")
            registry.unregister("automate.frontier.read")

        context = mirror.reasoning.start_mission(
            "Automate frontier capability " + capability_id,
            str(capability.get("name") or capability_id),
            assumptions=[str(x) for x in (item.get("task", {}).get("requirements", []) if isinstance(item.get("task"), Mapping) else [])],
        )
        mirror.observe(
            "FRONTIER COMMISSION: " + json.dumps(
                {
                    "capability_id": capability_id,
                    "base_revision": base_revision,
                    "task": capability.get("task"),
                    "mission": mission,
                },
                sort_keys=True,
            ),
            source="automate-frontier",
        )

        system = "\n".join([
            "You are Mirror, the autonomous engineering and research partner for Automate.",
            "Work only against the exact Automate revision supplied below.",
            "You may inspect the repository, research established implementations, write code, run bounded tests, and prepare a proposal.",
            "You may NOT push remote Git, mutate Automate canonical authority, alter the phase ledger or capability inventory, or claim certification.",
            "The returned Git diff is untrusted evidence for Automate to review and verify independently.",
            "",
            "CAPABILITY: " + capability_id,
            "NAME: " + str(capability.get("name") or ""),
            "BASE REVISION: " + base_revision,
            "TASK: " + str(capability.get("task") or ""),
            "MISSION: " + json.dumps(mission, sort_keys=True),
            "ALLOWED CANONICAL FILES: " + json.dumps(allowed),
            "FORBIDDEN FILES: " + json.dumps(sorted(forbidden)),
            "REQUIRED ACTION: " + str(mission.get("required_action") or "implement"),
            "",
            "Development order: observe → research when useful → implement the smallest general solution → adversarially test → inspect the diff.",
            "Do not edit shared integration files even if they appear useful. Return the implementation in the declared capability boundary.",
        ])
        tools = _tool_schemas(registry)
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": "Complete this bounded capability mission. Use tools rather than describing hypothetical code. End with a concise summary of what you actually changed and what remains unresolved.",
            },
        ]

        response = complete(messages, tools, timeout_seconds=min(120, max(30, int(limits.get("deadline_ms", 300_000)) // 1000)))
        for step in range(max_steps):
            final_response = response.content
            if not response.tool_calls:
                break
            messages.append(_assistant_message(response))
            for call in response.tool_calls:
                name = str(call.get("name") or "")
                args = call.get("arguments") if isinstance(call.get("arguments"), Mapping) else {}
                try:
                    context = mirror.reasoning.state
                    tool_context = mirror.tools and __import__("mirror_lab.tooling", fromlist=["ToolContext"]).ToolContext(
                        cycle_id=str(job.get("action_cycle_id")),
                        mission_id=context.mission_id if context else str(job.get("action_cycle_id")),
                        objective=str(capability.get("task") or capability.get("name") or capability_id),
                        specialist=registry.get(name).specialist if name in registry.names() else SpecialistName.REASONING,
                        capability_id=capability_id,
                        source_revision=base_revision,
                        authorization_granted=True,
                        timeout_seconds=float(registry.get(name).timeout_seconds if name in registry.names() else 30.0),
                    )
                    tool_result = registry.invoke(name, args, tool_context)
                    trace.append({
                        "tool": name,
                        "status": tool_result.status,
                        "error": tool_result.error,
                        "output": tool_result.output,
                    })
                    mirror.observe(
                        f"tool={name} status={tool_result.status} error={tool_result.error or ''} output={str(tool_result.output)[:12000]}",
                        source="frontier-tool",
                        confidence=1.0 if tool_result.succeeded else 0.5,
                    )
                    payload = tool_result.output if tool_result.succeeded else {"error": tool_result.error}
                except Exception as exc:
                    trace.append({"tool": name, "status": "failed", "error": str(exc), "output": None})
                    payload = {"error": str(exc)}
                messages.append({
                    "role": "tool",
                    "tool_call_id": str(call.get("id")),
                    "content": json.dumps(payload, ensure_ascii=False, default=str)[:100_000],
                })
            response = complete(messages, tools, timeout_seconds=min(120, max(30, int(limits.get("deadline_ms", 300_000)) // 1000)))
            if step + 1 >= max_steps:
                final_response = response.content

        changed = _changed_files(workdir)
        if len(changed) > MAX_CHANGED_FILES:
            return {
                "schema_version": RESULT_SCHEMA_VERSION,
                "authority": "UNTRUSTED_MIRROR_PROPOSAL",
                "request_id": str(job.get("request_id")),
                "action_cycle_id": str(job.get("action_cycle_id")),
                "capability_id": capability_id,
                "base_revision": base_revision,
                "status": "PATCH_REJECTED",
                "proposal": {"summary": "Too many changed files.", "diff": {"stdout": ""}},
                "tests": [item for item in trace if item.get("tool") == "workspace.run_safe"],
                "unresolved": ["frontier proposal exceeded maximum changed-file count"],
                "provenance": {"source_repo": "rynahmed101-sys/the-mirror", "source_component": "python-frontier-worker"},
            }
        out_of_scope = [path for path in changed if not _under_prefix(path, allowed)]
        forbidden_touched = [path for path in changed if path in forbidden]
        if out_of_scope or forbidden_touched:
            reasons = []
            if out_of_scope:
                reasons.append("files outside capability boundary: " + ", ".join(sorted(out_of_scope)))
            if forbidden_touched:
                reasons.append("forbidden control-plane files: " + ", ".join(sorted(forbidden_touched)))
            return {
                "schema_version": RESULT_SCHEMA_VERSION,
                "authority": "UNTRUSTED_MIRROR_PROPOSAL",
                "request_id": str(job.get("request_id")),
                "action_cycle_id": str(job.get("action_cycle_id")),
                "capability_id": capability_id,
                "base_revision": base_revision,
                "status": "PATCH_REJECTED",
                "proposal": {"summary": "Scope policy rejected the generated patch.", "diff": {"stdout": ""}},
                "tests": [item for item in trace if item.get("tool") == "workspace.run_safe"],
                "unresolved": reasons,
                "provenance": {"source_repo": "rynahmed101-sys/the-mirror", "source_component": "python-frontier-worker"},
            }

        diff = _diff(workdir)
        status = "PROPOSED" if diff else "NO_CHANGE_PROPOSED"
        mirror.brain.consolidate()
        return {
            "schema_version": RESULT_SCHEMA_VERSION,
            "authority": "UNTRUSTED_MIRROR_PROPOSAL",
            "request_id": str(job.get("request_id")),
            "action_cycle_id": str(job.get("action_cycle_id")),
            "correlation_id": str((_record(job.get("provenance")) or {}).get("correlation_id") or ""),
            "capability_id": capability_id,
            "base_revision": base_revision,
            "status": status,
            "proposal": {
                "summary": final_response[:12_000],
                "diff": {"stdout": diff},
                "changed_files": changed,
            },
            "tests": [item for item in trace if item.get("tool") == "workspace.run_safe"],
            "unresolved": [
                "Generated changes are untrusted until Automate independently verifies and promotes them."
            ] + [
                str(item["error"]) for item in trace if item.get("status") == "failed" and item.get("error")
            ],
            "provenance": {
                "source_repo": "rynahmed101-sys/the-mirror",
                "source_component": "python-frontier-worker",
                "base_revision": base_revision,
            },
            "tool_trace_count": len(trace),
        }
    except AIProviderError as exc:
        return {
            "schema_version": RESULT_SCHEMA_VERSION,
            "authority": "UNTRUSTED_MIRROR_PROPOSAL",
            "request_id": str(job.get("request_id")),
            "action_cycle_id": str(job.get("action_cycle_id")),
            "capability_id": capability_id,
            "base_revision": base_revision,
            "status": "FRONTIER_FAILED",
            "proposal": {"summary": "Mirror reasoning provider failed before a proposal was returned.", "diff": {"stdout": ""}},
            "tests": [item for item in trace if item.get("tool") == "workspace.run_safe"],
            "unresolved": [str(exc)],
            "provenance": {"source_repo": "rynahmed101-sys/the-mirror", "source_component": "python-frontier-worker"},
        }
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


class FrontierHandler(BaseHTTPRequestHandler):
    server_version = "MirrorFrontier/0.1"

    def _authorized(self) -> bool:
        expected = os.getenv("MIRROR_FRONTIER_JOB_TOKEN", "").strip()
        return bool(expected) and self.headers.get("Authorization") == "Bearer " + expected

    def _json(self, status: int, payload: Mapping[str, Any]) -> None:
        body = json.dumps(dict(payload), ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path != "/api/internal/frontier":
            self._json(404, {"error": "not found"})
            return
        if not self._authorized():
            self._json(403, {"error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self._json(413, {"error": "request body exceeds bounded size"})
            return
        try:
            raw = self.rfile.read(length)
            job = json.loads(raw.decode("utf-8"))
            result = run_frontier_job(job)
            self._json(200, result)
        except Exception as exc:
            self._json(500, {
                "schema_version": RESULT_SCHEMA_VERSION,
                "authority": "UNTRUSTED_MIRROR_PROPOSAL",
                "status": "FRONTIER_FAILED",
                "error": str(exc),
            })

    def log_message(self, format: str, *args: Any) -> None:
        return


def serve(host: str = "0.0.0.0", port: int = 8080) -> None:
    token = os.getenv("MIRROR_FRONTIER_JOB_TOKEN", "").strip()
    if not token:
        raise RuntimeError("MIRROR_FRONTIER_JOB_TOKEN is required")
    server = ThreadingHTTPServer((host, port), FrontierHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    serve(
        host=os.getenv("MIRROR_FRONTIER_HOST", "0.0.0.0"),
        port=int(os.getenv("MIRROR_FRONTIER_PORT", "8080")),
    )
