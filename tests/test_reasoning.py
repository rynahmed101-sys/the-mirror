from pathlib import Path

import pytest

from mirror_lab.brain import MemoryKind
from mirror_lab.mirror_ai import MirrorAI, MirrorAIConfig
from mirror_lab.reasoning import (
    Claim,
    ConstraintKind,
    EvidenceDisposition,
    EpistemicStatus,
    ReasoningEngine,
    SpecialistName,
)


def test_reasoning_end_to_end_and_persistence(tmp_path: Path):
    config = MirrorAIConfig(state_dir=tmp_path / "state")
    ai = MirrorAI(config)

    mission = ai.start_mission(
        "Automate capability frontier",
        "repair and verify the earliest mathematical capability",
        assumptions=("canonical ledger is authoritative",),
    )
    assert mission.mission_id

    parts = ai.decompose(
        (
            "inspect authoritative ledger",
            "inspect existing implementation",
            "implement bounded repair",
            "run tests",
            "independent cross-check",
        )
    )
    assert len(parts) == 5
    assert mission.active_subproblem == parts[0].id

    hypothesis = ai.add_hypothesis(
        "the current implementation is sufficient after the bounded repair"
    )
    supporting = ai.add_evidence(
        "targeted regression tests pass",
        source="pytest",
        classification=EpistemicStatus.OBSERVED.value,
        confidence=0.9,
    )
    contradictory = ai.add_evidence(
        "an independent check still fails",
        source="independent-check",
        classification=EpistemicStatus.OBSERVED.value,
        confidence=0.9,
    )
    ai.evaluate_hypothesis(hypothesis.id, supporting.id, EvidenceDisposition.SUPPORTS)
    revised = ai.evaluate_hypothesis(
        hypothesis.id, contradictory.id, EvidenceDisposition.CONTRADICTS
    )
    assert revised.resolution.value == "REVISE"
    assert revised.status is EpistemicStatus.PROPOSED

    contradictions = ai.reasoning.detect_contradictions(
        (
            Claim("solver", "status", "pass"),
            Claim("solver", "status", "fail"),
        )
    )
    assert contradictions

    hard = ai.add_constraint(
        "external-certification",
        "Mirror cannot certify its own science",
        kind=ConstraintKind.HARD,
    )
    assert ai.reasoning.check_constraints((hard,), violated_names=(hard.name,)) == (
        hard.name,
    )

    action = ai.propose_action(
        "repair failing pytest in GitHub repository",
        available_tools=("workspace.read", "github.diff", "python.run"),
    )
    assert action.specialist is SpecialistName.GITHUB
    assert action.tool == "github.diff"
    assert action.bounded is True

    plan = ai.plan_verification("Taylor expansion implementation", scientific=True)
    assert any("counterexamples" in step for step in plan.steps)
    assert plan.fail_closed is True

    failure1 = ai.reasoning.record_failure(
        "run exact-head verification",
        input_state="worker PR head",
        classification="ci_failure",
        evidence=("workflow 1 failed",),
        likely_cause="regression",
        confidence=0.8,
    )
    failure2 = ai.reasoning.record_failure(
        "run exact-head verification",
        input_state="worker PR head",
        classification="ci_failure",
        evidence=("workflow 2 failed",),
        likely_cause="same regression",
        confidence=0.8,
    )
    assert failure1.next_strategy == "repair_then_reverify"
    assert failure2.next_strategy == "change_strategy"

    with pytest.raises(PermissionError):
        ai.refuse_self_certification()

    ai.close()

    reopened = MirrorAI(config)
    resumed = reopened.resume_mission()
    assert resumed is not None
    assert resumed.objective == mission.objective
    assert resumed.failed_attempts
    assert reopened.snapshot()["memories"] >= 4
    reopened.close()


def test_attention_preserves_bounded_provenance(tmp_path: Path):
    ai = MirrorAI(MirrorAIConfig(state_dir=tmp_path / "state"))
    ai.observe(
        "exact-head verification failed because branch SHA was stale",
        kind=MemoryKind.FAILURE,
        source="automate",
        confidence=0.8,
    )
    ai.observe(
        "exact-head verification passed after refreshing branch SHA",
        kind=MemoryKind.EVIDENCE,
        source="automate",
        confidence=0.95,
    )
    context = ai.reasoning.attention("exact-head verification", limit=1)
    assert len(context.memories) == 1
    assert context.memories[0]["content_hash"]
    assert context.memories[0]["provenance"]
    ai.close()
