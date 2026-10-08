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
from .builtin_tools import build_default_tool_registry
from .cycle import CognitiveCycle, CycleResult
from .tooling import ToolRegistry, ToolSpec
from .reasoning import (
    ActionProposal,
    ConstraintKind,
    Evidence,
    EvidenceDisposition,
    Hypothesis,
    MissionState,
    ReasoningEngine,
    SpecialistName,
    VerificationPlan,
)


@dataclass(frozen=True)
class MirrorAIConfig:
    state_dir: Path = Path(".mirror_state")
    name: str = "Mirror AI"
    workspace_root: Path | None = None


class MirrorAI:
    """Persistent Mirror intelligence substrate with an explicit authority boundary."""

    def __init__(self, config: MirrorAIConfig | None = None) -> None:
        cfg = config or MirrorAIConfig()
        self.name = cfg.name
        self.brain = MirrorBrain(cfg.state_dir / "brain.sqlite3")
        self.reasoning = ReasoningEngine(self.brain)
        workspace_root = cfg.workspace_root or Path.cwd()
        self.tools = build_default_tool_registry(workspace_root=workspace_root)
        self.cycle = CognitiveCycle(self.brain, self.reasoning, self.tools)

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

    def register_tool(self, spec: ToolSpec) -> None:
        self.tools.register(spec)

    def tool_manifest(self):
        return self.tools.manifest()

    def run_cycle(
        self,
        objective: str,
        *,
        mission: str | None = None,
        capability_id: str | None = None,
        available_tools: Iterable[str] | None = None,
        input_value=None,
        authorization_granted: bool = False,
        source_revision: str | None = None,
    ) -> CycleResult:
        return self.cycle.run_once(
            objective,
            mission=mission,
            capability_id=capability_id,
            available_tools=available_tools,
            input_value=input_value,
            authorization_granted=authorization_granted,
            source_revision=source_revision,
        )

    def start_mission(
        self,
        mission: str,
        objective: str,
        *,
        blockers: Iterable[str] = (),
        assumptions: Iterable[str] = (),
    ) -> MissionState:
        return self.reasoning.start_mission(
            mission, objective, blockers=blockers, assumptions=assumptions
        )

    def resume_mission(self) -> MissionState | None:
        return self.reasoning.resume_last_mission()

    def decompose(self, steps: Iterable[str]):
        return self.reasoning.decompose(steps)

    def add_evidence(
        self,
        content: str,
        *,
        source: str,
        classification: str = "OBSERVED",
        confidence: float = 1.0,
    ) -> Evidence:
        return self.reasoning.add_evidence(
            content,
            source=source,
            classification=classification,
            confidence=confidence,
        )

    def add_hypothesis(
        self,
        statement: str,
        *,
        assumptions: Iterable[str] = (),
    ) -> Hypothesis:
        return self.reasoning.add_hypothesis(statement, assumptions=assumptions)

    def evaluate_hypothesis(
        self,
        hypothesis_id: str,
        evidence_id: str,
        disposition: EvidenceDisposition,
    ) -> Hypothesis:
        return self.reasoning.evaluate_hypothesis(
            hypothesis_id, evidence_id, disposition
        )

    def route_specialist(self, objective: str) -> SpecialistName:
        return self.reasoning.route_specialist(objective)

    def plan_verification(self, claim: str, *, scientific: bool = True) -> VerificationPlan:
        return self.reasoning.plan_verification(claim, scientific=scientific)

    def propose_action(self, objective: str, *, available_tools: Iterable[str] = ()) -> ActionProposal:
        return self.reasoning.propose_action(objective, available_tools=available_tools)

    def add_constraint(self, name: str, statement: str, *, kind: ConstraintKind = ConstraintKind.HARD):
        return self.reasoning.add_constraint(name, statement, kind=kind)

    def refuse_self_certification(self) -> None:
        self.reasoning.refuse_self_certification()
