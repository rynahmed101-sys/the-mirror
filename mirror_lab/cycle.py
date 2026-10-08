"""Executable model-independent Mirror cognitive cycle."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from enum import Enum
import hashlib
from typing import Any, Iterable

from .brain import MirrorBrain
from .reasoning import (
    ActionProposal,
    EpistemicStatus,
    EvidenceDisposition,
    MissionState,
    ReasoningEngine,
    SpecialistName,
    VerificationPlan,
)
from .tooling import ToolContext, ToolRegistry, ToolResult


class CyclePhase(str, Enum):
    MISSION = "MISSION"
    ATTENTION = "ATTENTION"
    RECALL = "RECALL"
    REASON = "REASON"
    PLAN = "PLAN"
    SELECT_SPECIALIST = "SELECT_SPECIALIST"
    SELECT_TOOL = "SELECT_TOOL"
    ACT = "ACT"
    OBSERVE = "OBSERVE"
    ANALYZE = "ANALYZE"
    STORE_EVIDENCE = "STORE_EVIDENCE"
    UPDATE_MEMORY = "UPDATE_MEMORY"
    SELF_AUDIT = "SELF_AUDIT"
    LEARN = "LEARN"
    VERIFY = "VERIFY"
    PROPOSE = "PROPOSE"
    WAIT = "WAIT"
    NEXT_TASK = "NEXT_TASK"


@dataclass(frozen=True)
class CycleResult:
    cycle_id: str
    phase: CyclePhase
    mission: MissionState
    specialist: SpecialistName
    action: ActionProposal
    tool_result: ToolResult | None
    verification: VerificationPlan
    proposal: dict[str, Any]
    resumeable: bool = True


def _id(*parts: str) -> str:
    return "cycle-" + hashlib.sha256("\x1f".join(parts).encode()).hexdigest()[:16]


class CognitiveCycle:
    """Run one bounded pass of the persistent Mirror loop."""

    def __init__(
        self,
        brain: MirrorBrain,
        reasoning: ReasoningEngine,
        tools: ToolRegistry,
    ) -> None:
        self.brain = brain
        self.reasoning = reasoning
        self.tools = tools

    def _transition(self, cycle_id: str, phase: CyclePhase, **payload: Any) -> None:
        self.brain.record_event(
            "cognitive_cycle_transition",
            {"cycle_id": cycle_id, "phase": phase.value, **payload},
        )

    def run_once(
        self,
        objective: str,
        *,
        mission: str | None = None,
        capability_id: str | None = None,
        available_tools: Iterable[str] | None = None,
        input_value: Any = None,
        authorization_granted: bool = False,
        source_revision: str | None = None,
    ) -> CycleResult:
        if not objective.strip():
            raise ValueError("objective is required")

        available_tool_list = (
            tuple(self.tools.names())
            if available_tools is None
            else tuple(dict.fromkeys(tool for tool in available_tools if tool))
        )

        current = self.reasoning.state
        cycle_id = _id(
            current.mission_id if current else mission or "mission",
            objective,
            source_revision or "",
        )
        self._transition(cycle_id, CyclePhase.MISSION, objective=objective)

        if current is None or current.objective != objective:
            if not mission:
                mission = objective
            current = self.reasoning.start_mission(mission, objective)
        self._transition(cycle_id, CyclePhase.ATTENTION)
        attention = self.reasoning.attention(objective, limit=8)
        self._transition(cycle_id, CyclePhase.RECALL, memories=len(attention.memories))

        self._transition(cycle_id, CyclePhase.REASON)
        self._transition(cycle_id, CyclePhase.PLAN)
        specialist = self.reasoning.route_specialist(objective)
        self._transition(cycle_id, CyclePhase.SELECT_SPECIALIST, specialist=specialist.value)

        tool_name = self.reasoning.select_tool(specialist, available_tool_list)
        action = self.reasoning.propose_action(objective, available_tools=available_tool_list)
        if tool_name is not None and action.tool is None:
            action = ActionProposal(
                specialist=action.specialist,
                tool=tool_name,
                objective=action.objective,
                reason=action.reason,
                bounded=True,
                authorization_required=self.tools.get(tool_name).authorization_required,
            )
        self._transition(cycle_id, CyclePhase.SELECT_TOOL, tool=tool_name)

        tool_result: ToolResult | None = None
        evidence = None
        if tool_name is not None:
            spec = self.tools.get(tool_name)
            context = ToolContext(
                cycle_id=cycle_id,
                mission_id=current.mission_id,
                objective=objective,
                specialist=specialist,
                capability_id=capability_id,
                source_revision=source_revision,
                authorization_granted=authorization_granted,
                timeout_seconds=min(30.0, spec.timeout_seconds),
            )
            self._transition(cycle_id, CyclePhase.ACT, tool=tool_name)
            tool_result = self.tools.invoke(tool_name, input_value, context)
            self._transition(
                cycle_id,
                CyclePhase.OBSERVE,
                status=tool_result.status,
                error=tool_result.error,
            )

            self._transition(cycle_id, CyclePhase.ANALYZE)
            evidence = self.reasoning.add_evidence(
                tool_result.error if tool_result.error else str(tool_result.output),
                source=tool_result.provenance,
                classification=tool_result.evidence_classification,
                confidence=1.0 if tool_result.succeeded else 0.5,
            )
            self._transition(cycle_id, CyclePhase.STORE_EVIDENCE, evidence_id=evidence.id)

            if tool_result.succeeded:
                current.known_facts.append(evidence.id)
            else:
                failure = self.reasoning.record_failure(
                    f"invoke {tool_name}",
                    input_state=str(input_value),
                    classification="tool_failure",
                    evidence=(evidence.id,),
                    likely_cause=tool_result.error or "tool returned failed status",
                    confidence=0.5,
                )
                current.failed_attempts.append(failure.id)
            self._transition(cycle_id, CyclePhase.UPDATE_MEMORY)

        self._transition(cycle_id, CyclePhase.SELF_AUDIT)
        audit = self.brain.self_audit(limit=1)

        verification = self.reasoning.plan_verification(objective, scientific=bool(capability_id))
        self._transition(cycle_id, CyclePhase.VERIFY)

        proposal = {
            "schema_version": "mirror.cognitive_proposal.v1",
            "cycle_id": cycle_id,
            "mission_id": current.mission_id,
            "objective": objective,
            "specialist": specialist.value,
            "tool": tool_name,
            "tool_status": tool_result.status if tool_result else "not_selected",
            "verification": asdict(verification),
            "evidence_id": evidence.id if evidence else None,
            "audit_event_id": audit[0]["id"] if audit else None,
            "self_certified": False,
            "authority": "Automate" if capability_id else "external-or-human",
        }
        self._transition(cycle_id, CyclePhase.PROPOSE, proposal=proposal)
        self._transition(cycle_id, CyclePhase.WAIT)
        self._transition(cycle_id, CyclePhase.NEXT_TASK)
        return CycleResult(
            cycle_id=cycle_id,
            phase=CyclePhase.NEXT_TASK,
            mission=current,
            specialist=specialist,
            action=action,
            tool_result=tool_result,
            verification=verification,
            proposal=proposal,
        )
