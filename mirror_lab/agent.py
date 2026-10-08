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
        self.tools = registry or ToolRegistry()
        self._register_default_tools()

    def _register_default_tools(self) -> None:
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
        allowed = re.compile(r"^(python -m pytest(?:\\s+.*)?|pytest(?:\\s+.*)?)$")
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
        self.brain.record_event(
            "planner_route",
            {"specialist": specialist.value, "objective": mission.objective},
        )
        if any(x in q for x in ("research", "literature", "paper", "approach", "reference")):
            plan.append("research_world")
        if any(x in q for x in ("experiment", "simulate", "test hypothesis")):
            plan.append("run_manifest")
        if any(x in q for x in ("implement", "build", "code", "repair", "fix", "patch")):
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
            args = dict(call.get("arguments", {}))
            if name in {"implement_automate_change", "repair_automate_change"}:
                args.setdefault("base_revision", mission.automate_revision)
            try:
                result = self.tools.execute(name, args)
                self.brain.record_event(
                    "tool_result",
                    {"tool": name, "status": str(result.get("status", "returned"))},
                )
                results.append({"tool": name, "result": result})
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
