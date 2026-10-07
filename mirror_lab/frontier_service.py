"""Execute a bounded Mirror frontier mission.

The service function is transport-neutral so it can be mounted behind Chanfana,
a local worker, or another authenticated HTTP adapter without changing scientific code.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .agent import FrontierAgent
from .operator import FrontierOperator, MissionContext
from .provider import OpenAICompatibleProvider
from .research import ResearchTool
from .toolbelt import build_tool_registry
from .git_tools import GitTool
from .workspace import WorkspaceTool


def execute_frontier_job(
    envelope: dict[str, Any],
    *,
    workspace_root: str | Path,
    provider: Any | None = None,
) -> dict[str, Any]:
    mission_data = envelope["mission"]
    capability = envelope["capability"]
    mission = MissionContext(
        cycle_id=str(envelope["action_cycle_id"]),
        capability_id=str(capability["id"]),
        current_backlog=tuple(mission_data.get("current_backlog", ())),
        ledger_frontier=tuple(mission_data.get("ledger_frontier", ())),
        automate_requests=tuple(mission_data.get("automate_requests", ())),
        repair_required=bool(mission_data.get("repair_required", False)),
        discovery_allowed=bool(mission_data.get("discovery_allowed", False)),
        ledger_hash=mission_data.get("ledger_hash"),
    )
    workspace = WorkspaceTool(workspace_root)
    tools = build_tool_registry(workspace=workspace, research=ResearchTool())
    provider = provider or OpenAICompatibleProvider()
    agent = FrontierAgent(FrontierOperator(provider), tools, max_steps=int(envelope["limits"]["max_tool_steps"]))
    context = {
        "capability": capability,
        "required_action": mission_data.get("required_action"),
        "reference_grounded": False,
        "tool_policy": {
            "network": bool(envelope["permissions"]["network"]),
            "workspace_write": bool(envelope["permissions"]["workspace_write"]),
            "local_execution": bool(envelope["permissions"]["local_execution"]),
            "git_commit": bool(envelope["permissions"]["git_commit"]),
            "remote_git_mutation": False,
            "canonical_mutation": False,
        },
    }
    result = agent.run(mission, context)
    git = GitTool(workspace.root)
    status = git.status()
    diff = git.diff()
    return {
        **result,
        "schema_version": "mirror.frontier_result.v1",
        "capability_id": capability["id"],
        "base_revision": capability["base_revision"],
        "proposal": {"status": status, "diff": diff},
        "authority": "UNTRUSTED_MIRROR_PROPOSAL",
    }
