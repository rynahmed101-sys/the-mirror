"""Executable Mirror agent core.

This is the runtime boundary for the Python lab. It deliberately separates:
- reasoning/planning,
- tool registration,
- tool execution,
- untrusted proposals.

No tool can certify Automate authority.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .brain import MirrorBrain
from .operator import LabOperator
from .research import ResearchTool
from .reasoning import ReasoningEngine
from .inference import InferenceEngine
from .github_tools import GitHubTool
from .free_tools import FreeToolbelt


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    handler: Callable[[dict[str, Any]], dict[str, Any]]
    mutating: bool = False


class ToolRegistry:
    """The executable Mirror toolbelt. Registration and execution are explicit."""

    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"duplicate tool: {tool.name}")
        self._tools[tool.name] = tool

    def names(self) -> tuple[str, ...]:
        return tuple(sorted(self._tools))

    def describe(self) -> list[dict[str, Any]]:
        return [
            {"name": t.name, "description": t.description, "mutating": t.mutating}
            for t in self._tools.values()
        ]

    def execute(self, name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
        tool = self._tools.get(name)
        if tool is None:
            raise KeyError(f"unknown Mirror tool: {name}")
        result = tool.handler(arguments or {})
        if not isinstance(result, dict):
            raise TypeError(f"tool {name} returned non-object result")
        return result


@dataclass
class Mission:
    objective: str
    capability_id: str | None = None
    automate_revision: str | None = None
    task: dict[str, Any] = field(default_factory=dict)
    authorization_granted: bool = False


class MirrorAgent:
    """Small, executable control core around the existing scientific lab."""

    def __init__(
        self,
        *,
        operator: LabOperator | None = None,
        research: ResearchTool | None = None,
        registry: ToolRegistry | None = None,
        brain: MirrorBrain | None = None,
    ) -> None:
        self.operator = operator
        self.research = research or ResearchTool()
        self.brain = brain or MirrorBrain(Path(os.environ.get("MIRROR_BRAIN_PATH", ".mirror/brain.sqlite3")))
        self.reasoning = ReasoningEngine(self.brain)
        self.inference = InferenceEngine(self.brain, self.reasoning)
        self.tools = registry or ToolRegistry()
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        github = GitHubTool(Path.cwd())
        free = FreeToolbelt(Path.cwd())
        self.tools.register(Tool(
            "github_repo_state",
            "Inspect bounded remote GitHub repository state.",
            lambda _a: github.repo_state(),
        ))
        self.tools.register(Tool(
            "github_ci",
            "Read CI state for an exact Git revision.",
            lambda a: github.ci(str(a.get("revision", ""))),
        ))
        self.tools.register(Tool(
            "free_tool_capabilities",
            "Detect optional free/open research and coding capabilities.",
            lambda _a: {"status": "OK", "capabilities": free.available()},
        ))
        if free.available().get("agent_reach"):
            self.tools.register(Tool(
                "agent_reach_doctor",
                "Health-check Agent-Reach internet backends when installed.",
                lambda _a: free.agent_reach_doctor(),
            ))
        if free.available().get("hermes"):
            self.tools.register(Tool(
                "hermes_coding_agent",
                "Run the optional Hermes free-tier coding agent in an exact temporary Automate checkout and return only an untrusted diff.",
                lambda a: free.hermes_proposal(
                    revision=str(a.get("revision") or ""),
                    objective=str(a.get("objective") or ""),
                    prompt=str(a.get("prompt") or ""),
                ),
                mutating=True,
            ))
        if free.available().get("opencode"):
            self.tools.register(Tool(
                "free_coding_agent",
                "Run an optional coding agent in an exact temporary Automate checkout and return only an untrusted diff.",
                lambda a: free.opencode_proposal(
                    revision=str(a.get("revision") or ""),
                    objective=str(a.get("objective") or ""),
                    prompt=str(a.get("prompt") or ""),
                ),
                mutating=True,
            ))
        self.tools.register(Tool(
            "research_world",
            "Search bounded scientific/software/model sources with provenance.",
            lambda a: self.research.search(
                str(a.get("query", "")),
                providers=tuple(str(x) for x in a.get("providers", ())),
                limit_per_provider=int(a.get("limit", 5)),
            ),
        ))
        self.tools.register(Tool(
            "list_tools",
            "Inspect the currently executable Mirror toolbelt.",
            lambda _a: {"tools": self.tools.describe()},
        ))
        self.tools.register(Tool(
            "run_manifest",
            "Execute a declarative experiment manifest through the local scientific operator.",
            self._run_manifest,
            mutating=True,
        ))
        self.tools.register(Tool(
            "implement_automate_change",
            "Apply and test a bounded unified diff against an exact Automate revision.",
            self._implement_automate_change,
            mutating=True,
        ))
        self.tools.register(Tool(
            "propose_capability",
            "Create an untrusted capability proposal package for Automate.",
            self._propose_capability,
            mutating=True,
        ))
        self.tools.register(Tool(
            "repair_automate_change",
            "Repair an Automate patch using the same bounded isolated implementation chamber.",
            self._implement_automate_change,
            mutating=True,
        ))

    def _run_manifest(self, args: dict[str, Any]) -> dict[str, Any]:
        if self.operator is None:
            raise RuntimeError("scientific operator is not configured")
        path = str(args.get("path", "")).strip()
        if not path:
            raise ValueError("manifest path is required")
        result = self.operator.load_and_run(path, record=False)
        return {"status": result.status, "experiment_id": result.experiment_id, "result": result}

    @staticmethod
    def _checked_sha(value: Any) -> str:
        sha = str(value or "")
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("base_revision must be an exact 40-character Git SHA")
        return sha

    def _implement_automate_change(self, args: dict[str, Any]) -> dict[str, Any]:
        revision = self._checked_sha(args.get("base_revision"))
        patch = str(args.get("patch", ""))
        if not patch:
            raise ValueError("patch is required")
        tests = [str(x) for x in args.get("tests", [])][:4]
        allowed = re.compile(r"^(python -m pytest(?:\s+.*)?|pytest(?:\s+.*)?)$")
        if any(not allowed.fullmatch(t) for t in tests):
            raise ValueError("unsupported test command")
        repo = "https://github.com/rynahmed101-sys/automate.git"
        root = Path(tempfile.mkdtemp(prefix="mirror-automate-"))
        try:
            def run(*cmd: str) -> subprocess.CompletedProcess[str]:
                return subprocess.run(cmd, cwd=root, text=True, capture_output=True, check=False)

            for cmd in (
                ("git", "init"),
                ("git", "remote", "add", "origin", repo),
                ("git", "fetch", "--depth", "1", "origin", revision),
                ("git", "checkout", "--detach", revision),
            ):
                result = run(*cmd)
                if result.returncode:
                    raise RuntimeError((result.stderr or result.stdout)[-4000:])

            patch_path = root / ".mirror-frontier.patch"
            patch_path.write_text(patch, encoding="utf-8")
            check = subprocess.run(
                ["git", "apply", "--check", "--whitespace=error", str(patch_path)],
                cwd=root, text=True, capture_output=True, check=False,
            )
            if check.returncode:
                return {"status": "PATCH_REJECTED", "base_revision": revision, "error": check.stderr[-6000:]}
            apply = subprocess.run(
                ["git", "apply", "--whitespace=error", str(patch_path)],
                cwd=root, text=True, capture_output=True, check=False,
            )
            if apply.returncode:
                return {"status": "PATCH_APPLY_FAILED", "base_revision": revision, "error": apply.stderr[-6000:]}

            results = []
            for command in tests:
                result = subprocess.run(command, cwd=root, shell=True, text=True, capture_output=True, check=False)
                results.append({
                    "command": command,
                    "status": "passed" if result.returncode == 0 else "failed",
                    "exit_code": result.returncode,
                    "stdout": result.stdout[-12000:],
                    "stderr": result.stderr[-8000:],
                })
                if result.returncode:
                    break
            diff = subprocess.run(
                ["git", "diff", "--binary", "--no-ext-diff"],
                cwd=root, text=True, capture_output=True, check=False,
            )
            return {
                "status": "PATCH_TEST_FAILED" if any(x["status"] == "failed" for x in results) else "PATCH_VALIDATED",
                "authority": "UNTRUSTED_MIRROR_PROPOSAL",
                "base_revision": revision,
                "tests": results,
                "diff": diff.stdout[:1_900_000],
            }
        finally:
            shutil.rmtree(root, ignore_errors=True)

    def _publish_automate_change(self, args: dict[str, Any]) -> dict[str, Any]:
        if not args.get("authorization_granted"):
            return {"status": "AUTHORIZATION_DENIED", "error": "mission did not grant GitHub mutation authorization"}
        revision = self._checked_sha(args.get("base_revision"))
        patch = str(args.get("patch", ""))
        branch = str(args.get("branch", "")).strip()
        title = str(args.get("title", "")).strip()
        body = str(args.get("body", "")).strip()
        if not patch or not branch.startswith("mirror/") or not title or not body:
            raise ValueError("patch, mirror branch, title, and body are required")
        tests = [str(x) for x in args.get("tests", [])][:4]
        allowed = re.compile(r"^(python -m pytest(?:\s+.*)?|pytest(?:\s+.*)?)$")
        if any(not allowed.fullmatch(t) for t in tests):
            raise ValueError("unsupported test command")
        root = Path(tempfile.mkdtemp(prefix="mirror-publish-"))
        try:
            def run(*cmd: str, timeout: int = 180) -> subprocess.CompletedProcess[str]:
                return subprocess.run(cmd, cwd=root, text=True, capture_output=True, check=False, timeout=min(max(timeout, 1), 300), env=os.environ.copy())
            repo = "https://github.com/rynahmed101-sys/automate.git"
            for cmd in (
                ("git", "init"), ("git", "remote", "add", "origin", repo),
                ("git", "fetch", "--depth", "1", "origin", revision), ("git", "checkout", "--detach", revision),
                ("git", "config", "user.name", "Mirror Autonomous Agent"),
                ("git", "config", "user.email", "mirror-agent@users.noreply.github.com"), ("gh", "auth", "setup-git"),
            ):
                result = run(*cmd)
                if result.returncode:
                    return {"status": "PUBLISH_PREPARATION_FAILED", "step": cmd, "error": (result.stderr or result.stdout)[-6000:]}
            patch_path = root / ".mirror-frontier.patch"
            patch_path.write_text(patch, encoding="utf-8")
            check = run("git", "apply", "--check", "--whitespace=error", str(patch_path), timeout=30)
            if check.returncode:
                return {"status": "PATCH_REJECTED", "base_revision": revision, "error": check.stderr[-6000:]}
            apply = run("git", "apply", "--whitespace=error", str(patch_path), timeout=30)
            if apply.returncode:
                return {"status": "PATCH_APPLY_FAILED", "base_revision": revision, "error": apply.stderr[-6000:]}
            changed = run("git", "diff", "--name-only", timeout=30)
            paths = [p.strip() for p in changed.stdout.splitlines() if p.strip()]
            blocked = [p for p in paths if p.startswith(".github/workflows/") or p in {"docs/PROJECT_PHASE_LEDGER.md", "docs/MATH_PHYSICS_ROADMAP.md"}]
            if blocked:
                return {"status": "PROTECTED_PATH_REJECTED", "paths": blocked, "base_revision": revision}
            test_results = []
            for command in tests:
                result = run("bash", "-lc", command, timeout=300)
                test_results.append({"command": command, "status": "passed" if result.returncode == 0 else "failed", "exit_code": result.returncode, "stdout": result.stdout[-12000:], "stderr": result.stderr[-8000:]})
                if result.returncode:
                    return {"status": "PUBLISH_TEST_FAILED", "base_revision": revision, "tests": test_results}
            if not paths:
                return {"status": "NO_DIFF", "base_revision": revision}
            branch_check = run("git", "checkout", "-B", branch, timeout=30)
            if branch_check.returncode:
                return {"status": "BRANCH_PREPARATION_FAILED", "error": branch_check.stderr[-6000:]}
            for cmd in (("git", "add", "--all"), ("git", "commit", "-m", title[:200])):
                result = run(*cmd, timeout=60)
                if result.returncode:
                    return {"status": "COMMIT_FAILED", "step": cmd, "error": (result.stderr or result.stdout)[-6000:]}
            head = run("git", "rev-parse", "HEAD", timeout=30).stdout.strip()
            github = GitHubTool(root)
            push = github.push_branch(branch)
            if push.get("returncode") != 0:
                return {"status": "PUSH_FAILED", "head_revision": head, "push": push}
            pr = github.create_pr(branch, title, body)
            if pr.get("returncode") != 0:
                return {"status": "PR_CREATE_FAILED", "head_revision": head, "push": push, "pr": pr}
            return {"status": "PR_CREATED", "authority": "UNTRUSTED_MIRROR_PROPOSAL", "base_revision": revision, "head_revision": head, "branch": branch, "tests": test_results, "pr": pr}
        finally:
            shutil.rmtree(root, ignore_errors=True)
    @staticmethod
    def _propose_capability(args: dict[str, Any]) -> dict[str, Any]:
        required = ("id", "name", "summary")
        if any(not str(args.get(k, "")).strip() for k in required):
            raise ValueError("id, name and summary are required")
        proposal = {
            "schema_version": "mirror.capability_proposal.v1",
            "authority": "UNTRUSTED_MIRROR_PROPOSAL",
            "capability": {k: args[k] for k in ("id", "name", "summary")},
            "prerequisites": list(args.get("prerequisites", [])),
            "dependencies": list(args.get("dependencies", [])),
            "evidence": list(args.get("evidence", [])),
            "risks": list(args.get("risks", [])),
            "limitations": list(args.get("limitations", [])),
        }
        return {"status": "CANDIDATE", "proposal": proposal}

    def plan(self, mission: Mission) -> list[str]:
        """Conservative deterministic fallback plan.

        A real reasoning provider may replace this planner, but it receives the
        exact same tool registry and cannot bypass its executor.
        """
        q = mission.objective.lower()
        self.reasoning.start_mission(
            mission.capability_id or "mirror.mission",
            mission.objective,
            assumptions=[str(x) for x in mission.task.get("assumptions", [])],
        )
        plan: list[str] = ["list_tools"]
        specialist = self.reasoning.route_specialist(mission.objective)
        context = self.inference.build_context(
            mission.objective,
            capability_id=mission.capability_id,
            source_revision=mission.automate_revision,
            task=mission.task,
        )
        inferred = self.inference.infer(context, self.tools.names())
        self.brain.record_event(
            "inference_attached_to_plan",
            {"plan_id": inferred.plan_id, "confidence": inferred.confidence, "unresolved": list(inferred.unresolved)},
        )
        for step in inferred.steps:
            if step.tool and step.tool in self.tools.names() and step.tool not in plan:
                plan.append(step.tool)
        self.brain.record_event(
            "planner_route",
            {"specialist": specialist.value, "objective": mission.objective},
        )
        if any(x in q for x in ("research", "literature", "paper", "approach", "reference")):
            plan.append("research_world")
        if any(x in q for x in ("experiment", "simulate", "test hypothesis")):
            plan.append("run_manifest")
        if any(x in q for x in ("implement", "build", "code", "repair", "fix", "patch")):
            if "hermes_coding_agent" in self.tools.names():
                plan.append("hermes_coding_agent")
            elif "free_coding_agent" in self.tools.names():
                plan.append("free_coding_agent")
            else:
                plan.append("implement_automate_change" if "repair" not in q else "repair_automate_change")
        if "propose" in q or "new capability" in q:
            plan.append("propose_capability")
        self.brain.record_event("plan_created", {"mission": mission.objective, "tools": plan})
        return plan

    def execute_plan(self, mission: Mission, calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Execute a reviewed tool plan and retain every result as untrusted evidence."""
        results = []
        for call in calls:
            name = str(call.get("tool", ""))
            if name.startswith("github_") and name in {"github_push_branch", "github_create_pr"} and not mission.authorization_granted:
                results.append({"tool": name, "result": {"status": "AUTHORIZATION_DENIED", "error": "mission did not grant GitHub mutation authorization"}})
                continue
            tool = self.tools._tools.get(name)
            if tool is None:
                results.append({"tool": name, "result": {"status": "TOOL_NOT_FOUND", "error": "unknown Mirror tool"}})
                continue
            if tool.mutating and not mission.authorization_granted:
                results.append({"tool": name, "result": {"status": "AUTHORIZATION_DENIED", "error": "mission did not grant mutation authorization"}})
                continue
            args = dict(call.get("arguments", {}))
            if name in {"implement_automate_change", "repair_automate_change"}:
                args.setdefault("base_revision", mission.automate_revision)
            if name in {"free_coding_agent", "hermes_coding_agent"}:
                args.setdefault("revision", mission.automate_revision)
                args.setdefault("objective", mission.objective)
            try:
                result = self.tools.execute(name, args)
                self.brain.record_event(
                    "tool_result",
                    {"tool": name, "status": str(result.get("status", "returned"))},
                )
                results.append({"tool": name, "result": result})
                if name in {"hermes_coding_agent", "free_coding_agent"}:
                    diff = str(result.get("diff") or "")
                    if result.get("status") == "PROPOSAL_READY" and diff:
                        apply_result = self.tools.execute(
                            "implement_automate_change",
                            {
                                "base_revision": mission.automate_revision,
                                "patch": diff,
                                "tests": list(mission.task.get("verification_commands", []))[:4],
                            },
                        )
                        self.brain.record_event(
                            "generated_change_applied",
                            {"provider": name, "status": str(apply_result.get("status", "returned"))},
                        )
                        results.append({"tool": "implement_automate_change", "result": apply_result})
                        if mission.authorization_granted and apply_result.get("status") == "PATCH_VALIDATED":
                            branch_seed = re.sub(r"[^a-z0-9._/-]+", "-", str(mission.capability_id or "mission").lower()).strip("-/")
                            branch = f"mirror/{branch_seed[:55]}-{str(mission.automate_revision or "")[:8]}"
                            capability_label = mission.capability_id or "autonomous change"
                            publish = self.tools.execute(
                                "github_publish_automate_patch",
                                {
                                    "authorization_granted": True, "base_revision": mission.automate_revision, "patch": diff,
                                    "tests": list(mission.task.get("verification_commands", []))[:4], "branch": branch,
                                    "title": f"mirror: {capability_label}"[:200],
                                    "body": "Autonomous Mirror proposal.\n\n" + f"Base revision: `{mission.automate_revision}`\n" + f"Capability: `{capability_label}`\n\n" + "This PR is untrusted until Automate verification and promotion accepts it.",
                                },
                            )
                            self.brain.record_event("generated_change_published", {"status": str(publish.get("status", "returned")), "branch": branch})
                            results.append({"tool": "github_publish_automate_patch", "result": publish})
            except Exception as exc:
                self.brain.record_event(
                    "tool_failure",
                    {"tool": name, "error": str(exc)[:2000]},
                )
                results.append({"tool": name, "result": {"status": "TOOL_FAILED", "error": str(exc)}})
                self.reasoning.record_failure(
                    name,
                    input_state=json.dumps(args, sort_keys=True),
                    classification="tool_failure",
                    evidence=[str(exc)],
                    likely_cause="tool execution raised an exception",
                    confidence=0.8,
                )
                break
        return results
