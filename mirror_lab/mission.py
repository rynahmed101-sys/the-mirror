"""Machine-readable mission runner for non-deployed Mirror execution.

A mission is input data, not authority. The runner creates a persistent brain,
plans through the executable toolbelt, executes only bounded registered tools,
and emits an untrusted result suitable for Automate verification.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .agent import Mission, MirrorAgent
from .brain import MirrorBrain


def run_mission(path: str | Path, *, output: str | Path | None = None) -> dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    objective = str(payload.get("objective", "")).strip()
    if not objective:
        raise ValueError("mission objective is required")

    brain_path = Path(payload.get("brain_path", ".mirror/brain.sqlite3"))
    brain = MirrorBrain(brain_path)
    agent = MirrorAgent(brain=brain)
    mission = Mission(
        objective=objective,
        capability_id=(str(payload["capability_id"]) if payload.get("capability_id") else None),
        automate_revision=(str(payload["automate_revision"]) if payload.get("automate_revision") else None),
        task=dict(payload.get("task", {})),
        authorization_granted=bool(payload.get("authorization_granted", False)),
    )

    explicit_calls = payload.get("calls")
    if explicit_calls is None:
        plan = agent.plan(mission)
        supplied = dict(payload.get("arguments", {}))
        calls = []
        for name in plan:
            args = dict(supplied.get(name, {}))
            if name == "propose_capability" and not args:
                args = {
                    "id": mission.capability_id or "mirror.generated.capability",
                    "name": mission.capability_id or "Mirror generated capability",
                    "summary": objective,
                    "prerequisites": list(mission.task.get("prerequisites", [])),
                    "dependencies": list(mission.task.get("dependencies", [])),
                }
            calls.append({"tool": name, "arguments": args})
    else:
        if not isinstance(explicit_calls, list):
            raise ValueError("calls must be a list")
        calls = [dict(item) for item in explicit_calls]

    result = {
        "schema_version": "mirror.mission_result.v1",
        "authority": "UNTRUSTED_MIRROR_PROPOSAL",
        "objective": objective,
        "capability_id": mission.capability_id,
        "automate_revision": mission.automate_revision,
        "plan": [str(call.get("tool", "")) for call in calls],
        "results": agent.execute_plan(mission, calls),
        "brain": brain.snapshot(),
        "self_audit": brain.self_audit(limit=50),
    }
    if output:
        Path(output).parent.mkdir(parents=True, exist_ok=True)
        Path(output).write_text(json.dumps(result, indent=2, sort_keys=True, default=str), encoding="utf-8")
    brain.close()
    return result
