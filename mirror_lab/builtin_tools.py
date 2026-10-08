"""Concrete bounded tools wired into Mirror's single ToolRegistry."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .automate import read_automate_frontier
from .frontier import frontier_tool_spec
from .git_tools import GitTool
from .github_tools import GitHubTool
from .reasoning import SpecialistName
from .research import ResearchTool
from .tooling import ToolContext, ToolRegistry, ToolSpec
from .workspace import WorkspaceTool


def build_default_tool_registry(
    *,
    workspace_root: str | Path,
    frontier_client: Any | None = None,
) -> ToolRegistry:
    workspace = WorkspaceTool(workspace_root)

    def read_frontier(value: Any, _context: Any) -> dict[str, Any]:
        snapshot = read_automate_frontier(
            repository=str(value.get("repository") or "rynahmed101-sys/automate"),
            revision=str(value.get("revision") or "main"),
        )
        return {
            "authority": snapshot.authority,
            "snapshot": snapshot.__dict__,
        }
    research = ResearchTool()
    registry = ToolRegistry()

    registry.register(
        ToolSpec(
            name="research.search",
            specialist=SpecialistName.RESEARCH,
            handler=lambda value, context: research.search(
                str(value.get("query") or ""),
                providers=tuple(value.get("providers") or ()),
                limit_per_provider=int(value.get("limit_per_provider", 5)),
            ),
            description="Search bounded scholarly and implementation sources.",
            timeout_seconds=60.0,
        )
    )
    registry.register(
        ToolSpec(
            name="automate.frontier.read",
            specialist=SpecialistName.REASONING,
            handler=read_frontier,
            description="Read Automate's canonical ledger and inventory without mutation.",
            timeout_seconds=30.0,
        )
    )
    registry.register(
        ToolSpec(
            name="research.fetch",
            specialist=SpecialistName.RESEARCH,
            handler=lambda value, context: research.fetch(
                str(value.get("locator") or ""),
                max_bytes=int(value.get("max_bytes", 2_000_000)),
            ),
            description="Fetch a bounded HTTPS source and preserve its content hash.",
            timeout_seconds=30.0,
        )
    )
    registry.register(
        ToolSpec(
            name="workspace.read",
            specialist=SpecialistName.CODING,
            handler=lambda value, context: workspace.read(str(value.get("path") or "")),
            description="Read a bounded file inside the mission workspace.",
            timeout_seconds=10.0,
        )
    )
    registry.register(
        ToolSpec(
            name="workspace.write",
            specialist=SpecialistName.CODING,
            handler=lambda value, context: workspace.write(
                str(value.get("path") or ""),
                str(value.get("content") or ""),
                overwrite=bool(value.get("overwrite", True)),
            ),
            description="Write a bounded file inside the mission workspace.",
            timeout_seconds=15.0,
            authorization_required=True,
            mutating=True,
        )
    )
    registry.register(
        ToolSpec(
            name="workspace.run",
            specialist=SpecialistName.CODING,
            handler=lambda value, context: workspace.run(
                [str(item) for item in value.get("command", [])],
                timeout_seconds=int(value.get("timeout_seconds", 120)),
            ),
            description="Run a bounded local command in the mission workspace.",
            timeout_seconds=300.0,
            authorization_required=True,
            mutating=True,
        )
    )
    git = GitTool(workspace_root)
    github = GitHubTool(workspace_root)
    registry.register(
        ToolSpec(
            name="git.status",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: git.status(),
            description="Inspect local repository state.",
            timeout_seconds=10.0,
        )
    )
    registry.register(
        ToolSpec(
            name="git.diff",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: git.diff(),
            description="Inspect local Git changes.",
            timeout_seconds=20.0,
        )
    )
    registry.register(
        ToolSpec(
            name="git.branch",
            specialist=SpecialistName.CODING,
            handler=lambda value, context: git.create_branch(str(value.get("name") or "")),
            description="Create an isolated local proposal branch.",
            timeout_seconds=10.0,
            authorization_required=True,
            mutating=True,
        )
    )
    registry.register(
        ToolSpec(
            name="git.commit",
            specialist=SpecialistName.CODING,
            handler=lambda value, context: git.commit(str(value.get("message") or "")),
            description="Commit a local proposal; remote push is unavailable.",
            timeout_seconds=30.0,
            authorization_required=True,
            mutating=True,
        )
    )
    registry.register(
        ToolSpec(
            name="github.repo_state",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: github.repo_state(),
            description="Inspect bounded remote repository state.",
            timeout_seconds=30.0,
        )
    )
    registry.register(
        ToolSpec(
            name="github.push_branch",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: github.push_branch(str(value.get("branch") or "")),
            description="Push only a Mirror-owned branch.",
            timeout_seconds=180.0,
            authorization_required=True,
            mutating=True,
        )
    )
    registry.register(
        ToolSpec(
            name="github.create_pr",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: github.create_pr(
                str(value.get("branch") or ""),
                str(value.get("title") or ""),
                str(value.get("body") or ""),
            ),
            description="Open a reviewable PR from a Mirror-owned branch; never merge it.",
            timeout_seconds=120.0,
            authorization_required=True,
            mutating=True,
        )
    )
    registry.register(
        ToolSpec(
            name="github.ci",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: github.ci(str(value.get("revision") or "")),
            description="Read CI status for an exact Git revision.",
            timeout_seconds=60.0,
        )
    )
    if frontier_client is not None:
        registry.register(frontier_tool_spec(frontier_client))
    return registry
