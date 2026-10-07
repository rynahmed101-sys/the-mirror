from pathlib import Path

import pytest

from mirror_lab.brain import MirrorBrain
from mirror_lab.cycle import CognitiveCycle, CyclePhase
from mirror_lab.reasoning import SpecialistName
from mirror_lab.tooling import ToolContext, ToolRegistry, ToolSpec


def _registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        ToolSpec(
            name="github.diff",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: {"input": value, "revision": context.source_revision},
            description="bounded GitHub diff observation",
        )
    )
    registry.register(
        ToolSpec(
            name="github.write",
            specialist=SpecialistName.GITHUB,
            handler=lambda value, context: {"mutated": value},
            authorization_required=True,
            mutating=True,
        )
    )
    return registry


def test_registry_requires_unique_tools_and_explicit_write_authorization():
    registry = _registry()
    with pytest.raises(ValueError):
        registry.register(
            ToolSpec(
                name="github.diff",
                specialist=SpecialistName.GITHUB,
                handler=lambda value, context: value,
            )
        )

    denied = registry.invoke(
        "github.write",
        {"commit": "x"},
        ToolContext(
            cycle_id="cycle-1",
            mission_id="mission-1",
            objective="update GitHub",
            specialist=SpecialistName.GITHUB,
            authorization_granted=False,
        ),
    )
    assert denied.status == "authorization_denied"
    assert denied.evidence_classification == "PROPOSED"


def test_cognitive_cycle_executes_tool_records_evidence_and_refuses_self_certification(tmp_path: Path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    from mirror_lab.reasoning import ReasoningEngine

    reasoning = ReasoningEngine(brain)
    registry = _registry()
    cycle = CognitiveCycle(brain, reasoning, registry)

    result = cycle.run_once(
        "inspect GitHub repository state",
        mission="Automate integration",
        capability_id="stage1b.series_expansions",
        available_tools=("github.diff",),
        input_value={"repository": "rynahmed101-sys/automate", "ref": "engine"},
        source_revision="a" * 40,
    )
    assert result.phase is CyclePhase.NEXT_TASK
    assert result.specialist is SpecialistName.GITHUB
    assert result.tool_result is not None
    assert result.tool_result.status == "succeeded"
    assert result.proposal["self_certified"] is False
    assert brain.snapshot()["events"] >= 10
    with pytest.raises(PermissionError):
        reasoning.refuse_self_certification()
    brain.close()


def test_cognitive_cycle_can_resume_persisted_mission(tmp_path: Path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    from mirror_lab.reasoning import ReasoningEngine

    reasoning = ReasoningEngine(brain)
    registry = _registry()
    cycle = CognitiveCycle(brain, reasoning, registry)
    first = cycle.run_once(
        "inspect repository",
        mission="persistent mission",
        available_tools=("github.diff",),
        input_value="x",
    )
    brain.close()

    reopened = MirrorBrain(tmp_path / "brain.sqlite3")
    resumed = ReasoningEngine(reopened)
    assert resumed.state is not None
    assert resumed.state.mission_id == first.mission.mission_id
    reopened.close()
