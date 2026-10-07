from pathlib import Path

from mirror_lab.brain import MemoryKind, MirrorBrain


def test_brain_persists_memory_goals_beliefs_and_audit(tmp_path: Path):
    db_path = tmp_path / "mirror-brain.sqlite3"
    brain = MirrorBrain(db_path)

    memory = brain.observe(
        "Taylor expansion remains the earliest Stage 1B frontier",
        kind=MemoryKind.EPISODIC,
        source="automate",
        confidence=0.9,
    )
    brain.set_goal("finish Taylor expansion verification", priority=10)
    brain.assert_belief(
        "Automate remains the external certification authority",
        confidence=0.99,
        evidence="system governance contract",
    )

    matches = brain.recall("Taylor expansion frontier", limit=3)
    assert matches
    assert matches[0].memory.id == memory.id

    events = brain.self_audit()
    assert {event["event_type"] for event in events} >= {
        "memory_observed",
        "goal_created",
        "belief_asserted",
    }

    brain.close()

    reopened = MirrorBrain(db_path)
    assert reopened.snapshot()["memories"] == 1
    assert len(reopened.active_goals()) == 1
    reopened.close()


def test_goal_bias_and_bounded_priority(tmp_path: Path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    brain.observe("repair failed ODE dispatch", source="worker", confidence=1)
    brain.observe("ODE foundation research", source="research", confidence=1)
    brain.set_goal("repair failed ODE dispatch", priority=20)

    matches = brain.recall("ODE dispatch", limit=2)
    assert matches[0].memory.content == "repair failed ODE dispatch"

    assert brain.decide(
        repair_required=True,
        current_backlog=("capability-a",),
        ledger_frontier="capability-b",
        automate_requests=("request-c",),
        discovery_allowed=True,
    ).action == "repair"

    assert brain.decide(
        repair_required=False,
        current_backlog=("capability-a",),
        ledger_frontier="capability-b",
        automate_requests=(),
        discovery_allowed=True,
    ).action == "current_work"

    brain.close()


def test_consolidation_and_non_destructive_unlearn(tmp_path: Path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    first = brain.observe("same observation", kind=MemoryKind.EPISODIC)
    second = brain.observe("same observation", kind=MemoryKind.EPISODIC)

    assert brain.consolidate() == 1
    semantic = brain.recall("same observation", kinds=[MemoryKind.SEMANTIC])
    assert len(semantic) == 1

    brain.unlearn(first.id, reason="superseded by verified correction")
    assert brain.memory(first.id).tombstoned is True
    remaining = brain.recall("same observation", kinds=[MemoryKind.EPISODIC])
    assert len(remaining) == 1
    assert remaining[0].memory.id == second.id
    assert any(e["event_type"] == "memory_unlearned" for e in brain.self_audit())
    brain.close()


def test_working_and_procedural_memory(tmp_path: Path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    brain.start_session("cycle-1")
    brain.working_add("cycle-1", "inspect failed run")
    brain.working_add("cycle-1", "collect exact-head evidence")
    assert brain.working("cycle-1") == ["inspect failed run", "collect exact-head evidence"]

    procedure = brain.add_procedure("repair-flow", ["diagnose", "repair", "verify"])
    brain.record_procedure_result(procedure.id, success=True)
    assert brain.procedure(procedure.id).success_count == 1
    brain.close()
