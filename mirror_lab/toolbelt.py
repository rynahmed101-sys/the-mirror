"""Default AI tool registry for THE MIRROR.

This is the concrete bridge between the frontier agent and the scientific kernel.
Every tool is bounded and returns observations, never scientific certification.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .git_tools import GitTool
from .operator import LabOperator
from .research import ResearchTool
from .workspace import WorkspaceTool


@dataclass
class FunctionTool:
    name: str
    description: str
    function: Callable[[dict[str, Any]], dict[str, Any]]

    def invoke(self, arguments: dict[str, Any]) -> dict[str, Any]:
        return self.function(arguments)


def build_tool_registry(
    *,
    workspace: WorkspaceTool,
    research: ResearchTool | None = None,
    git: GitTool | None = None,
    lab: LabOperator | None = None,
):
    from .agent import ToolRegistry

    research = research or ResearchTool()
    git = git or GitTool(workspace.root)
    tools: dict[str, FunctionTool] = {
        "research.fetch": FunctionTool(
            "research.fetch",
            "Fetch a bounded HTTPS research source and preserve its content hash.",
            lambda a: research.fetch(str(a["locator"]), max_bytes=int(a.get("max_bytes", 2_000_000))),
        ),
        "research.search": FunctionTool(
            "research.search",
            "Search bounded scholarly/code sources, reference-first.",
            lambda a: research.search(research.plan(str(a["query"]), limit_per_provider=int(a.get("limit", 5)))),
        ),
        "workspace.read": FunctionTool(
            "workspace.read",
            "Read a bounded file inside the mission workspace.",
            lambda a: workspace.read(str(a["path"])),
        ),
        "workspace.write": FunctionTool(
            "workspace.write",
            "Write a bounded text file inside the mission workspace.",
            lambda a: workspace.write(str(a["path"]), str(a["content"]), overwrite=bool(a.get("overwrite", True))),
        ),
        "workspace.run": FunctionTool(
            "workspace.run",
            "Run a bounded local command in the mission workspace.",
            lambda a: workspace.run([str(x) for x in a["command"]], timeout_seconds=int(a.get("timeout_seconds", 120))),
        ),
        "git.status": FunctionTool("git.status", "Inspect local Git state.", lambda _: git.status()),
        "git.diff": FunctionTool("git.diff", "Inspect local changes.", lambda _: git.diff()),
        "git.branch": FunctionTool("git.branch", "Create an isolated proposal branch.", lambda a: git.create_branch(str(a["name"]))),
        "git.commit": FunctionTool("git.commit", "Commit a local proposal. Remote mutation is forbidden.", lambda a: git.commit(str(a["message"]))),
    }
    if lab is not None:
        tools["experiment.run_manifest"] = FunctionTool(
            "experiment.run_manifest",
            "Execute a declarative experiment through the scientific kernel.",
            lambda a: _run_manifest(lab, str(a["path"])),
        )
        tools["experiment.summarize"] = FunctionTool(
            "experiment.summarize",
            "Return descriptive trajectory statistics.",
            lambda a: {"summary": lab.summarize(list(a.get("values", [])))},
        )
    return ToolRegistry(tools)


def _run_manifest(lab: LabOperator, path: str) -> dict[str, Any]:
    result = lab.load_and_run(path, record=True)
    return {
        "experiment_id": result.experiment_id,
        "status": result.status,
        "diagnostics": result.diagnostics,
        "observation_count": len(result.observations),
        "final_state": result.final_state,
    }
