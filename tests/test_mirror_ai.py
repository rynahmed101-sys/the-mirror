from pathlib import Path

from mirror_lab.brain import MemoryKind
from mirror_lab.mirror_ai import MirrorAI, MirrorAIConfig


def test_mirror_ai_is_persistent_and_model_independent(tmp_path: Path):
    config = MirrorAIConfig(state_dir=tmp_path / "state")
    ai = MirrorAI(config)
    ai.observe(
        "Mirror must never self-certify scientific capabilities",
        kind=MemoryKind.BELIEF,
        source="governance",
        confidence=0.99,
    )
    ai.set_goal("repair the current failed capability", priority=100)

    decision = ai.decide(
        repair_required=True,
        current_backlog=("capability-1",),
        ledger_frontier="capability-2",
        automate_requests=(),
        discovery_allowed=True,
    )
    assert decision.action == "repair"
    assert ai.recall("self-certify scientific capabilities")
    ai.close()

    reopened = MirrorAI(config)
    assert reopened.snapshot()["memories"] == 1
    reopened.close()
