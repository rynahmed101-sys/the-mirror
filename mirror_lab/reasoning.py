"""Model-independent reasoning, mission state, and specialist routing for Mirror.

The reasoning layer is deliberately deterministic and provider-neutral. It
does not generate scientific truth. It turns goals into bounded work, records
hypotheses and evidence, detects structured contradictions, plans independent
verification, and produces auditable action proposals for downstream tools.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
import hashlib
import json
import re
from typing import Iterable, Mapping, Sequence

from .brain import MemoryKind, MirrorBrain


class EpistemicStatus(str, Enum):
    OBSERVED = "OBSERVED"
    INFERRED = "INFERRED"
    HYPOTHESIZED = "HYPOTHESIZED"
    PROPOSED = "PROPOSED"
    VERIFIED = "VERIFIED"
    CERTIFIED = "CERTIFIED"


class EvidenceDisposition(str, Enum):
    SUPPORTS = "SUPPORTS"
    CONTRADICTS = "CONTRADICTS"
    INCONCLUSIVE = "INCONCLUSIVE"


class HypothesisResolution(str, Enum):
    RETAIN = "RETAIN"
    REVISE = "REVISE"
    REJECT = "REJECT"
    INCONCLUSIVE = "INCONCLUSIVE"


class ConstraintKind(str, Enum):
    HARD = "HARD"
    PREFERENCE = "PREFERENCE"


class SpecialistName(str, Enum):
    REASONING = "reasoning"
    CODING = "coding"
    GITHUB = "github"
    RESEARCH = "research"
    SCIENTIFIC = "scientific"
    DIAGNOSTIC = "diagnostic"
    EXPERIMENT = "experiment"


@dataclass(frozen=True)
class Claim:
    subject: str
    predicate: str
    value: str

    @property
    def id(self) -> str:
        return _id("claim", self.subject, self.predicate, self.value)


@dataclass(frozen=True)
class Evidence:
    id: str
    content: str
    source: str
    classification: str
    confidence: float


@dataclass
class Hypothesis:
    id: str
    statement: str
    assumptions: tuple[str, ...] = ()
    status: EpistemicStatus = EpistemicStatus.HYPOTHESIZED
    evidence_ids: list[str] = field(default_factory=list)
    supporting: int = 0
    contradicting: int = 0
    inconclusive: int = 0
    confidence: float = 0.5
    resolution: HypothesisResolution = HypothesisResolution.INCONCLUSIVE


@dataclass(frozen=True)
class Constraint:
    name: str
    statement: str
    kind: ConstraintKind


@dataclass(frozen=True)
class Subproblem:
    id: str
    objective: str
    status: str = "pending"


@dataclass
class MissionState:
    mission_id: str
    mission: str
    objective: str
    active_subproblem: str | None = None
    blockers: list[str] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    known_facts: list[str] = field(default_factory=list)
    hypotheses: dict[str, Hypothesis] = field(default_factory=dict)
    evidence: dict[str, Evidence] = field(default_factory=dict)
    contradictions: list[dict[str, str]] = field(default_factory=list)
    unresolved_questions: list[str] = field(default_factory=list)
    completed_work: list[str] = field(default_factory=list)
    failed_attempts: list[str] = field(default_factory=list)
    next_action: str | None = None
    subproblems: list[Subproblem] = field(default_factory=list)


@dataclass(frozen=True)
class FailureRecord:
    id: str
    attempted: str
    input_state: str
    classification: str
    evidence: tuple[str, ...]
    likely_cause: str
    confidence: float
    next_strategy: str


@dataclass(frozen=True)
class Strategy:
    name: str
    rationale: str
    avoid_after_failures: int = 0


@dataclass(frozen=True)
class SpecialistSpec:
    name: SpecialistName
    responsibilities: tuple[str, ...]
    tool_families: tuple[str, ...]


@dataclass(frozen=True)
class ActionProposal:
    specialist: SpecialistName
    tool: str | None
    objective: str
    reason: str
    bounded: bool = True
    authorization_required: bool = False


@dataclass(frozen=True)
class VerificationPlan:
    claim: str
    steps: tuple[str, ...]
    independent_routes: tuple[str, ...]
    fail_closed: bool = True


@dataclass(frozen=True)
class AttentionContext:
    cue: str
    memories: tuple[dict[str, object], ...]
    bounded: bool = True


@dataclass(frozen=True)
class Contradiction:
    left_id: str
    right_id: str
    reason: str


SPECIALISTS: tuple[SpecialistSpec, ...] = (
    SpecialistSpec(
        SpecialistName.REASONING,
        ("decomposition", "hypotheses", "constraints", "contradictions", "planning"),
        ("planner", "reasoner"),
    ),
    SpecialistSpec(
        SpecialistName.CODING,
        ("repository inspection", "implementation", "debugging", "tests", "patching"),
        ("workspace.read", "workspace.write", "python.run"),
    ),
    SpecialistSpec(
        SpecialistName.GITHUB,
        ("branches", "PRs", "issues", "SHA lineage", "CI", "reviews"),
        ("github.read", "github.diff", "github.pr"),
    ),
    SpecialistSpec(
        SpecialistName.RESEARCH,
        ("literature", "source comparison", "provenance", "claim extraction"),
        ("research.search", "research.retrieve"),
    ),
    SpecialistSpec(
        SpecialistName.SCIENTIFIC,
        ("derivation", "mathematics", "physics", "dimensional checks", "counterexamples"),
        ("symbolic", "numeric", "dimensional"),
    ),
    SpecialistSpec(
        SpecialistName.DIAGNOSTIC,
        ("failure analysis", "regressions", "timeouts", "repair strategy"),
        ("test.log", "ci.log", "diagnostic"),
    ),
    SpecialistSpec(
        SpecialistName.EXPERIMENT,
        ("simulation", "sweeps", "perturbation", "reproduction"),
        ("experiment.run", "simulation.run", "parameter.sweep"),
    ),
)


def _id(prefix: str, *parts: str) -> str:
    payload = "\x1f".join(parts)
    return f"{prefix}-{hashlib.sha256(payload.encode()).hexdigest()[:16]}"


def _tokens(text: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_]{2,}", text.lower()))


class ReasoningEngine:
    """Persistent deterministic reasoning coordinator over the shared brain."""

    def __init__(self, brain: MirrorBrain) -> None:
        self.brain = brain
        self.state: MissionState | None = self.resume_last_mission()

    def start_mission(
        self,
        mission: str,
        objective: str,
        *,
        blockers: Iterable[str] = (),
        assumptions: Iterable[str] = (),
    ) -> MissionState:
        if not mission.strip() or not objective.strip():
            raise ValueError("mission and objective are required")
        mission_id = _id("mission", mission, objective)
        self.state = MissionState(
            mission_id=mission_id,
            mission=mission,
            objective=objective,
            blockers=[x for x in blockers if x],
            assumptions=[x for x in assumptions if x],
        )
        self._checkpoint("mission_started")
        return self.state

    def resume_last_mission(self) -> MissionState | None:
        # Replay the newest event carrying a complete mission state. Event names
        # are labels, not replay authority: recovery checkpoints can be attached
        # to evidence, contradiction, or failure events.
        for event in reversed(self.brain.self_audit(limit=500)):
            payload = event.get("payload")
            if isinstance(payload, Mapping) and isinstance(payload.get("state"), Mapping):
                return self._state_from_payload(payload["state"])
        return None

    def _checkpoint(self, event_type: str = "mission_checkpoint") -> None:
        if self.state is None:
            return
        payload = {"state": self._state_payload()}
        self.brain.record_event(event_type, payload)

    def _state_payload(self) -> dict[str, object]:
        assert self.state is not None
        return {
            "mission_id": self.state.mission_id,
            "mission": self.state.mission,
            "objective": self.state.objective,
            "active_subproblem": self.state.active_subproblem,
            "blockers": list(self.state.blockers),
            "assumptions": list(self.state.assumptions),
            "known_facts": list(self.state.known_facts),
            "hypotheses": {
                key: {
                    **asdict(value),
                    "status": value.status.value,
                    "resolution": value.resolution.value,
                }
                for key, value in self.state.hypotheses.items()
            },
            "evidence": {key: asdict(value) for key, value in self.state.evidence.items()},
            "contradictions": list(self.state.contradictions),
            "unresolved_questions": list(self.state.unresolved_questions),
            "completed_work": list(self.state.completed_work),
            "failed_attempts": list(self.state.failed_attempts),
            "next_action": self.state.next_action,
            "subproblems": [asdict(item) for item in self.state.subproblems],
        }

    @staticmethod
    def _state_from_payload(payload: Mapping[str, object]) -> MissionState:
        hypotheses: dict[str, Hypothesis] = {}
        raw_hypotheses = payload.get("hypotheses", {})
        if isinstance(raw_hypotheses, Mapping):
            for key, raw in raw_hypotheses.items():
                if not isinstance(raw, Mapping):
                    continue
                hypotheses[str(key)] = Hypothesis(
                    id=str(raw["id"]),
                    statement=str(raw["statement"]),
                    assumptions=tuple(str(x) for x in raw.get("assumptions", [])),
                    status=EpistemicStatus(str(raw.get("status", "HYPOTHESIZED"))),
                    evidence_ids=[str(x) for x in raw.get("evidence_ids", [])],
                    supporting=int(raw.get("supporting", 0)),
                    contradicting=int(raw.get("contradicting", 0)),
                    inconclusive=int(raw.get("inconclusive", 0)),
                    confidence=float(raw.get("confidence", 0.5)),
                    resolution=HypothesisResolution(
                        str(raw.get("resolution", "INCONCLUSIVE"))
                    ),
                )
        evidence: dict[str, Evidence] = {}
        raw_evidence = payload.get("evidence", {})
        if isinstance(raw_evidence, Mapping):
            for key, raw in raw_evidence.items():
                if isinstance(raw, Mapping):
                    evidence[str(key)] = Evidence(
                        id=str(raw["id"]),
                        content=str(raw["content"]),
                        source=str(raw["source"]),
                        classification=str(raw["classification"]),
                        confidence=float(raw["confidence"]),
                    )
        return MissionState(
            mission_id=str(payload["mission_id"]),
            mission=str(payload["mission"]),
            objective=str(payload["objective"]),
            active_subproblem=(
                str(payload["active_subproblem"])
                if payload.get("active_subproblem") is not None
                else None
            ),
            blockers=[str(x) for x in payload.get("blockers", [])],
            assumptions=[str(x) for x in payload.get("assumptions", [])],
            known_facts=[str(x) for x in payload.get("known_facts", [])],
            hypotheses=hypotheses,
            evidence=evidence,
            contradictions=[
                {"left_id": str(item["left_id"]), "right_id": str(item["right_id"]), "reason": str(item["reason"])}
                for item in payload.get("contradictions", [])
                if isinstance(item, Mapping)
            ],
            unresolved_questions=[str(x) for x in payload.get("unresolved_questions", [])],
            completed_work=[str(x) for x in payload.get("completed_work", [])],
            failed_attempts=[str(x) for x in payload.get("failed_attempts", [])],
            next_action=(
                str(payload["next_action"]) if payload.get("next_action") is not None else None
            ),
            subproblems=[
                Subproblem(
                    id=str(item["id"]),
                    objective=str(item["objective"]),
                    status=str(item.get("status", "pending")),
                )
                for item in payload.get("subproblems", [])
                if isinstance(item, Mapping)
            ],
        )

    def decompose(self, steps: Iterable[str]) -> tuple[Subproblem, ...]:
        if self.state is None:
            raise RuntimeError("start a mission before decomposition")
        materialized = [step.strip() for step in steps if step.strip()]
        if not materialized:
            raise ValueError("decomposition requires at least one bounded step")
        self.state.subproblems.extend(
            Subproblem(_id("subproblem", self.state.mission_id, str(index), step), step)
            for index, step in enumerate(materialized, 1)
        )
        self.state.active_subproblem = self.state.subproblems[0].id
        self.state.next_action = self.state.subproblems[0].objective
        self._checkpoint()
        return tuple(self.state.subproblems)

    def add_evidence(
        self,
        content: str,
        *,
        source: str,
        classification: str = "OBSERVED",
        confidence: float = 1.0,
    ) -> Evidence:
        if not content.strip() or not source.strip():
            raise ValueError("evidence requires content and source")
        if classification not in {item.value for item in EpistemicStatus}:
            raise ValueError("invalid evidence classification")
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        kind_map = {
            EpistemicStatus.OBSERVED.value: MemoryKind.EVIDENCE,
            EpistemicStatus.INFERRED.value: MemoryKind.EVIDENCE,
            EpistemicStatus.HYPOTHESIZED.value: MemoryKind.EVIDENCE,
            EpistemicStatus.PROPOSED.value: MemoryKind.EVIDENCE,
            EpistemicStatus.VERIFIED.value: MemoryKind.EVIDENCE,
            EpistemicStatus.CERTIFIED.value: MemoryKind.EVIDENCE,
        }
        self.brain.observe(
            content,
            kind=kind_map[classification],
            source=source,
            confidence=confidence,
        )
        evidence = Evidence(
            id=_id("evidence", content, source, classification),
            content=content,
            source=source,
            classification=classification,
            confidence=confidence,
        )
        if self.state is not None:
            self.state.evidence[evidence.id] = evidence
            self.state.known_facts.append(evidence.id)
            self._checkpoint()
        return evidence

    def add_hypothesis(
        self,
        statement: str,
        *,
        assumptions: Iterable[str] = (),
    ) -> Hypothesis:
        if self.state is None:
            raise RuntimeError("start a mission before adding hypotheses")
        hypothesis = Hypothesis(
            id=_id("hypothesis", self.state.mission_id, statement),
            statement=statement,
            assumptions=tuple(x for x in assumptions if x),
        )
        self.state.hypotheses[hypothesis.id] = hypothesis
        self.state.unresolved_questions.append(statement)
        self._checkpoint()
        return hypothesis

    def evaluate_hypothesis(
        self,
        hypothesis_id: str,
        evidence_id: str,
        disposition: EvidenceDisposition,
    ) -> Hypothesis:
        if self.state is None:
            raise RuntimeError("no active mission")
        try:
            hypothesis = self.state.hypotheses[hypothesis_id]
            self.state.evidence[evidence_id]
        except KeyError as exc:
            raise KeyError("unknown hypothesis/evidence") from exc

        if evidence_id not in hypothesis.evidence_ids:
            hypothesis.evidence_ids.append(evidence_id)
        if disposition is EvidenceDisposition.SUPPORTS:
            hypothesis.supporting += 1
        elif disposition is EvidenceDisposition.CONTRADICTS:
            hypothesis.contradicting += 1
        else:
            hypothesis.inconclusive += 1

        total = hypothesis.supporting + hypothesis.contradicting + hypothesis.inconclusive
        evidence_delta = (hypothesis.supporting - hypothesis.contradicting) / max(1, total)
        hypothesis.confidence = max(0.0, min(1.0, 0.5 + 0.5 * evidence_delta))
        if hypothesis.contradicting > hypothesis.supporting:
            hypothesis.resolution = HypothesisResolution.REJECT
            hypothesis.status = EpistemicStatus.PROPOSED
        elif hypothesis.contradicting:
            hypothesis.resolution = HypothesisResolution.REVISE
            hypothesis.status = EpistemicStatus.PROPOSED
        elif hypothesis.supporting and not hypothesis.inconclusive:
            hypothesis.resolution = HypothesisResolution.RETAIN
            hypothesis.status = EpistemicStatus.PROPOSED
        else:
            hypothesis.resolution = HypothesisResolution.INCONCLUSIVE
            hypothesis.status = EpistemicStatus.HYPOTHESIZED
        self._checkpoint()
        return hypothesis

    def detect_contradictions(
        self,
        claims: Sequence[Claim],
    ) -> tuple[Contradiction, ...]:
        contradictions: list[Contradiction] = []
        for index, left in enumerate(claims):
            for right in claims[index + 1 :]:
                same_slot = (
                    left.subject.strip().lower() == right.subject.strip().lower()
                    and left.predicate.strip().lower() == right.predicate.strip().lower()
                )
                if same_slot and left.value.strip().lower() != right.value.strip().lower():
                    contradictions.append(
                        Contradiction(left.id, right.id, "same subject/predicate has different values")
                    )
        if self.state is not None:
            for item in contradictions:
                record = {
                    "left_id": item.left_id,
                    "right_id": item.right_id,
                    "reason": item.reason,
                }
                if record not in self.state.contradictions:
                    self.state.contradictions.append(record)
            if contradictions:
                self._checkpoint("contradictions_detected")
        return tuple(contradictions)

    def add_constraint(
        self,
        name: str,
        statement: str,
        *,
        kind: ConstraintKind = ConstraintKind.HARD,
    ) -> Constraint:
        if not name.strip() or not statement.strip():
            raise ValueError("constraint requires a name and statement")
        constraint = Constraint(name=name, statement=statement, kind=kind)
        self.brain.record_event(
            "constraint_added",
            {"name": name, "statement": statement, "kind": kind.value},
        )
        return constraint

    def check_constraints(
        self,
        constraints: Iterable[Constraint],
        *,
        violated_names: Iterable[str] = (),
    ) -> tuple[str, ...]:
        violations = set(violated_names)
        hard = tuple(c.name for c in constraints if c.kind is ConstraintKind.HARD and c.name in violations)
        if hard:
            self.brain.record_event(
                "hard_constraint_violation",
                {"constraints": list(hard), "fail_closed": True},
            )
        return hard

    def attention(
        self,
        cue: str,
        *,
        limit: int = 8,
        kinds: Iterable[MemoryKind] | None = None,
    ) -> AttentionContext:
        recalls = self.brain.recall(cue, limit=limit, kinds=kinds)
        memories = tuple(
            {
                "id": item.memory.id,
                "kind": item.memory.kind,
                "content": item.memory.content,
                "source": item.memory.source,
                "confidence": item.memory.confidence,
                "content_hash": item.memory.content_hash,
                "score": item.score,
                "provenance": item.provenance,
            }
            for item in recalls
        )
        return AttentionContext(cue=cue, memories=memories)

    def route_specialist(self, objective: str) -> SpecialistName:
        """Route by explicit task context, then lexical evidence.

        Repository/GitHub work is deliberately treated as an external-state
        operation: when the objective names GitHub/repository/branch/PR/SHA/CI
        semantics, the GitHub specialist owns the first routing decision even
        when the same sentence also contains coding or repair language.
        Diagnostic routing remains the default for failures that are not
        explicitly repository-scoped.
        """
        tokens = _tokens(objective)
        repository_cues = {"github", "repository", "repo", "branch", "pr", "pull", "commit", "sha", "ci", "merge"}
        if tokens & repository_cues:
            return SpecialistName.GITHUB

        scores = {name: 0 for name in SpecialistName}
        keywords: dict[SpecialistName, set[str]] = {
            SpecialistName.CODING: {"code", "coding", "implement", "patch", "test", "pytest", "bug", "debug"},
            SpecialistName.GITHUB: repository_cues,
            SpecialistName.RESEARCH: {"research", "paper", "literature", "source", "citation", "arxiv", "study"},
            SpecialistName.SCIENTIFIC: {"math", "physics", "equation", "derive", "calculus", "tensor", "proof"},
            SpecialistName.DIAGNOSTIC: {"failure", "failed", "error", "timeout", "broken", "regression", "repair"},
            SpecialistName.EXPERIMENT: {"experiment", "simulation", "sweep", "perturb", "benchmark", "trajectory"},
            SpecialistName.REASONING: {"reason", "decompose", "hypothesis", "contradiction", "plan", "constraint"},
        }
        for specialist, words in keywords.items():
            scores[specialist] = len(tokens & words)
        return max(scores, key=lambda name: (-scores[name], name.value))

    def select_tool(
        self,
        specialist: SpecialistName,
        available_tools: Iterable[str],
    ) -> str | None:
        tools = tuple(dict.fromkeys(tool for tool in available_tools if tool))
        if not tools:
            return None
        spec = next(item for item in SPECIALISTS if item.name is specialist)
        ranked = sorted(
            tools,
            key=lambda tool: (
                -max(
                    (len(_tokens(tool) & _tokens(family)) for family in spec.tool_families),
                    default=0,
                ),
                tool,
            ),
        )
        return ranked[0] if ranked else None

    def propose_action(
        self,
        objective: str,
        *,
        available_tools: Iterable[str] = (),
    ) -> ActionProposal:
        specialist = self.route_specialist(objective)
        tool = self.select_tool(specialist, available_tools)
        reason = f"{specialist.value} is the best deterministic specialist match for the objective"
        action = ActionProposal(
            specialist=specialist,
            tool=tool,
            objective=objective,
            reason=reason,
            bounded=True,
            authorization_required=tool is not None and tool.startswith(("github.", "workspace.write")),
        )
        self.brain.record_event("action_proposed", asdict(action) | {"specialist": specialist.value})
        return action

    def plan_verification(
        self,
        claim: str,
        *,
        scientific: bool = True,
    ) -> VerificationPlan:
        base = [
            "formalize the claim and assumptions",
            "attempt a direct derivation or primary implementation",
            "search for counterexamples",
            "test boundary and pathological cases",
            "run an independent formulation or implementation",
            "classify the resulting evidence",
        ]
        if scientific:
            base.insert(2, "check dimensions, domains, initial/boundary conditions, and limiting cases")
        plan = VerificationPlan(
            claim=claim,
            steps=tuple(base),
            independent_routes=("symbolic", "numeric", "independent implementation"),
            fail_closed=True,
        )
        self.brain.record_event("verification_plan_created", asdict(plan))
        return plan

    def record_failure(
        self,
        attempted: str,
        *,
        input_state: str,
        classification: str,
        evidence: Iterable[str],
        likely_cause: str,
        confidence: float,
    ) -> FailureRecord:
        if not attempted.strip() or not classification.strip() or not likely_cause.strip():
            raise ValueError("failure records require attempted work, classification, and likely cause")
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        strategy = self.next_strategy(classification)
        record = FailureRecord(
            id=_id("failure", attempted, input_state, classification),
            attempted=attempted,
            input_state=input_state,
            classification=classification,
            evidence=tuple(evidence),
            likely_cause=likely_cause,
            confidence=confidence,
            next_strategy=strategy.name,
        )
        self.brain.observe(
            json.dumps(asdict(record), sort_keys=True),
            kind=MemoryKind.FAILURE,
            source="diagnostic",
            confidence=confidence,
        )
        if self.state is not None:
            self.state.failed_attempts.append(record.id)
            self.state.next_action = strategy.name
            self._checkpoint("failure_recorded")
        return record

    def next_strategy(self, failure_classification: str) -> Strategy:
        repeated = 0
        for recall in self.brain.recall(
            failure_classification,
            limit=20,
            kinds=[MemoryKind.FAILURE],
        ):
            if failure_classification.lower() in recall.memory.content.lower():
                repeated += 1
        # A second occurrence means one prior matching failure already exists;
        # change strategy before recording the new failure to avoid repeating the
        # same tactic a third time.
        if repeated >= 1:
            strategy = Strategy(
                "change_strategy",
                "Repeated failure is present; do not repeat the same tactic.",
                avoid_after_failures=repeated,
            )
        else:
            strategy = Strategy(
                "repair_then_reverify",
                "Apply a bounded repair, then independently verify the result.",
                avoid_after_failures=repeated,
            )
        self.brain.record_event(
            "strategy_selected",
            {"name": strategy.name, "reason": strategy.rationale, "repeated_failures": repeated},
        )
        return strategy

    def refuse_self_certification(self) -> None:
        self.brain.record_event(
            "self_certification_refused",
            {"reason": "scientific certification belongs to external authority"},
        )
        raise PermissionError("Mirror AI cannot certify its own scientific work")

    def to_json(self, value: object) -> str:
        def encode(item: object) -> object:
            if isinstance(item, Enum):
                return item.value
            if hasattr(item, "__dataclass_fields__"):
                return {key: encode(value) for key, value in asdict(item).items()}
            if isinstance(item, Mapping):
                return {str(key): encode(value) for key, value in item.items()}
            if isinstance(item, (list, tuple)):
                return [encode(value) for value in item]
            return item
        return json.dumps(encode(value), sort_keys=True)
