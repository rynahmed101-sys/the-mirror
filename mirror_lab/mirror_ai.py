"""The model-independent Mirror AI core.

This is the persistent agent substrate.  It can maintain state, choose bounded
work, remember evidence, revise beliefs, and learn procedural outcomes without
depending on a language model or remote inference service.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from .brain import Belief, Decision, Goal, MemoryKind, MirrorBrain, Recall


@dataclass(frozen=True)
class MirrorAIConfig:
    state_dir: Path = Path(".mirror_state")
    name: str = "Mirror AI"


class MirrorAI:
    """Persistent Mirror intelligence substrate with an explicit authority boundary."""

    def __init__(self, config: MirrorAIConfig | None = None) -> None:
        cfg = config or MirrorAIConfig()
        self.name = cfg.name
        self.brain = MirrorBrain(cfg.state_dir / "brain.sqlite3")

    def close(self) -> None:
        self.brain.close()

    def observe(
        self,
        content: str,
        *,
        kind: MemoryKind = MemoryKind.EPISODIC,
        source: str = "mirror",
        confidence: float = 1.0,
    ):
        return self.brain.observe(
            content, kind=kind, source=source, confidence=confidence
        )

    def recall(self, cue: str, *, limit: int = 8) -> list[Recall]:
        return self.brain.recall(cue, limit=limit)

    def set_goal(self, text: str, *, priority: int = 0) -> Goal:
        return self.brain.set_goal(text, priority=priority)

    def assert_belief(
        self, text: str, *, confidence: float, evidence: str
    ) -> Belief:
        return self.brain.assert_belief(
            text, confidence=confidence, evidence=evidence
        )

    def decide(
        self,
        *,
        repair_required: bool,
        current_backlog: Iterable[str],
        ledger_frontier: str | None,
        automate_requests: Iterable[str],
        discovery_allowed: bool,
    ) -> Decision:
        """Choose work, never certify it.

        The decision is an operational proposal.  Scientific verification and
        canonical promotion remain outside this class.
        """
        return self.brain.decide(
            repair_required=repair_required,
            current_backlog=current_backlog,
            ledger_frontier=ledger_frontier,
            automate_requests=automate_requests,
            discovery_allowed=discovery_allowed,
        )

    def consolidate(self) -> int:
        return self.brain.consolidate()

    def snapshot(self) -> dict[str, int]:
        return self.brain.snapshot()
