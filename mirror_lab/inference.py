"""Bounded inference and action synthesis for Mirror.

This module is the missing middle layer between persistent cognition and tools.
It does not pretend that retrieval is reasoning. It builds a compact working
model from memories, task requirements, repository facts, failures, and
constraints, then compiles that model into a bounded action plan.

A generative provider can be attached later through the same interface. The
deterministic path remains executable without a model and is deliberately
fail-closed when a task needs free-form code synthesis.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
import hashlib
import re
from typing import Any, Iterable, Mapping

from .brain import MemoryKind, MirrorBrain
from .reasoning import ReasoningEngine, SpecialistName
from .knowledge import search as search_knowledge
from .recipes import TRANSFORMS


@dataclass(frozen=True)
class KnowledgeRule:
    name: str
    triggers: tuple[str, ...]
    conclusions: tuple[str, ...]
    next_steps: tuple[str, ...]
    priority: int = 0


@dataclass(frozen=True)
class InferenceContext:
    objective: str
    capability_id: str | None
    source_revision: str | None
    task: Mapping[str, Any]
    memories: tuple[dict[str, Any], ...]
    failures: tuple[dict[str, Any], ...]
    constraints: tuple[str, ...] = ()


@dataclass(frozen=True)
class InferenceStep:
    id: str
    action: str
    specialist: str
    tool: str | None
    reason: str
    inputs: tuple[str, ...] = ()
    requires_generation: bool = False


@dataclass(frozen=True)
class InferencePlan:
    plan_id: str
    context: InferenceContext
    conclusions: tuple[str, ...]
    steps: tuple[InferenceStep, ...]
    unresolved: tuple[str, ...]
    confidence: float


DEFAULT_KNOWLEDGE: tuple[KnowledgeRule, ...] = (
    KnowledgeRule(
        "repository-change",
        ("implement", "build", "code", "patch"),
        ("a repository change is required", "the change must be tested before proposal"),
        ("inspect_repository", "research_relevant_patterns", "synthesize_change", "test_change", "prepare_proposal"),
        100,
    ),
    KnowledgeRule(
        "repair-loop",
        ("repair", "fix", "failure", "broken", "regression", "ci"),
        ("the latest failure is evidence, not authority", "repeat failures require a changed strategy"),
        ("inspect_failure", "recall_prior_repairs", "synthesize_repair", "test_repair", "prepare_proposal"),
        110,
    ),
    KnowledgeRule(
        "github-operation",
        ("github", "repository", "repo", "branch", "pull", "pr", "commit", "merge", "sha"),
        ("remote state must be inspected by immutable identifiers", "remote mutation must remain bounded"),
        ("inspect_git_state", "prepare_branch_or_pr", "verify_remote_state"),
        90,
    ),
    KnowledgeRule(
        "capability-proposal",
        ("propose", "proposal"),
        ("a capability proposal is not an implementation request",),
        ("prepare_capability_proposal",),
        70,
    ),
    KnowledgeRule(
        "research-first",
        ("research", "literature", "paper", "approach", "reference", "unknown"),
        ("existing evidence should be consulted before reinvention"),
        ("research_world", "compare_evidence", "update_knowledge"),
        80,
    ),
    KnowledgeRule(
        "scientific-check",
        ("math", "physics", "equation", "derive", "calculus", "tensor", "proof", "simulation"),
        ("assumptions and boundary cases must be explicit", "independent verification is required"),
        ("formalize", "derive_or_compute", "counterexample", "independent_check"),
        85,
    ),
)


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z0-9_]{2,}", value.lower()))


class InferenceEngine:
    """Compile knowledge + memory + task constraints into executable intent."""

    def __init__(
        self,
        brain: MirrorBrain,
        reasoning: ReasoningEngine,
        *,
        rules: Iterable[KnowledgeRule] = DEFAULT_KNOWLEDGE,
    ) -> None:
        self.brain = brain
        self.reasoning = reasoning
        self.rules = tuple(rules)

    def build_context(
        self,
        objective: str,
        *,
        capability_id: str | None = None,
        source_revision: str | None = None,
        task: Mapping[str, Any] | None = None,
        constraints: Iterable[str] = (),
    ) -> InferenceContext:
        memories = tuple(
            {
                "id": item.memory.id,
                "kind": item.memory.kind,
                "content": item.memory.content,
                "source": item.memory.source,
                "confidence": item.memory.confidence,
                "score": item.score,
            }
            for item in self.brain.recall(objective, limit=12)
        )
        failure_recalls = self.brain.recall("failure repair regression", limit=8, kinds=[MemoryKind.FAILURE])
        failures = tuple(
            {
                "id": item.memory.id,
                "content": item.memory.content,
                "confidence": item.memory.confidence,
            }
            for item in failure_recalls
        )
        return InferenceContext(
            objective=objective,
            capability_id=capability_id,
            source_revision=source_revision,
            task=dict(task or {}),
            memories=memories,
            failures=failures,
            constraints=tuple(x for x in constraints if x),
        )

    def infer(self, context: InferenceContext, available_tools: Iterable[str]) -> InferencePlan:
        tokens = _tokens(context.objective + " " + " ".join(map(str, context.task.values())))
        knowledge = search_knowledge(context.objective + " " + " ".join(map(str, context.task.values())))
        available_transforms = tuple(sorted(TRANSFORMS))
        matched = [
            rule for rule in self.rules
            if tokens.intersection(rule.triggers)
        ]
        matched.sort(key=lambda rule: (-rule.priority, rule.name))

        conclusions: list[str] = [item.rule for item in knowledge]
        step_names: list[str] = []
        for rule in matched:
            conclusions.extend(x for x in rule.conclusions if x not in conclusions)
            for step in rule.next_steps:
                if step not in step_names:
                    step_names.append(step)

        if not matched:
            conclusions.append("no deterministic knowledge rule matched the mission")
            step_names = ["inspect_context", "research_world", "propose_next_action"]

        for item in knowledge:
            for procedure in item.procedure:
                if procedure not in step_names:
                    step_names.append(procedure)

        tools = tuple(dict.fromkeys(str(x) for x in available_tools if x))
        steps: list[InferenceStep] = []
        for index, name in enumerate(step_names, 1):
            specialist = self._specialist(name, context.objective)
            tool = self._tool_for(name, specialist, tools)
            requires_generation = name in {"synthesize_change", "synthesize_repair"}
            reason = self._reason(name, context)
            steps.append(
                InferenceStep(
                    id=self._id(context, name, index),
                    action=name,
                    specialist=specialist.value,
                    tool=tool,
                    reason=reason,
                    inputs=self._inputs(name, context),
                    requires_generation=requires_generation,
                )
            )

        unresolved: list[str] = []
        if context.capability_id and not context.source_revision:
            unresolved.append("exact source revision is required before repository mutation")
        if any(step.requires_generation for step in steps) and "implement_automate_change" in tools:
            unresolved.append("free-form code synthesis requires a generation provider or a structured patch recipe")
        if context.failures:
            unresolved.append("prior failures are retained as constraints until independently reverified")

        confidence = min(
            0.95,
            0.35
            + (0.15 if matched else 0)
            + min(0.25, len(context.memories) * 0.02)
            + (0.15 if context.task else 0),
        )
        plan = InferencePlan(
            plan_id="infer-" + hashlib.sha256(
                (context.objective + "|" + str(context.capability_id) + "|" + str(context.source_revision)).encode()
            ).hexdigest()[:16],
            context=context,
            conclusions=tuple(conclusions),
            steps=tuple(steps),
            unresolved=tuple(unresolved),
            confidence=confidence,
        )
        self.brain.record_event("inference_plan", asdict(plan))
        return plan

    def _specialist(self, action: str, objective: str) -> SpecialistName:
        mapping = {
            "research_world": SpecialistName.RESEARCH,
            "compare_evidence": SpecialistName.RESEARCH,
            "update_knowledge": SpecialistName.REASONING,
            "inspect_failure": SpecialistName.DIAGNOSTIC,
            "recall_prior_repairs": SpecialistName.DIAGNOSTIC,
            "synthesize_repair": SpecialistName.CODING,
            "synthesize_change": SpecialistName.CODING,
            "test_change": SpecialistName.CODING,
            "test_repair": SpecialistName.CODING,
            "prepare_proposal": SpecialistName.GITHUB,
            "inspect_git_state": SpecialistName.GITHUB,
            "prepare_branch_or_pr": SpecialistName.GITHUB,
            "verify_remote_state": SpecialistName.GITHUB,
            "formalize": SpecialistName.SCIENTIFIC,
            "derive_or_compute": SpecialistName.SCIENTIFIC,
            "counterexample": SpecialistName.SCIENTIFIC,
            "independent_check": SpecialistName.SCIENTIFIC,
        }
        return mapping.get(action, self.reasoning.route_specialist(objective))

    def _tool_for(self, action: str, specialist: SpecialistName, tools: tuple[str, ...]) -> str | None:
        aliases = {
            "research_world": ("research_world", "research.search"),
            "inspect_failure": ("github_ci", "workspace.read", "diagnostic"),
            "inspect_repository": ("workspace.read", "github.read"),
            "inspect_git_state": ("github.read", "git.status"),
            "test_change": ("run_tests", "python.run"),
            "test_repair": ("run_tests", "python.run"),
            "synthesize_change": ("implement_automate_change", "workspace.write"),
            "synthesize_repair": ("repair_automate_change", "workspace.write"),
            "prepare_proposal": ("propose_capability", "github.pr"),
            "prepare_capability_proposal": ("propose_capability", "github.pr"),
            "run_manifest": ("run_manifest", "experiment.run"),
        }
        candidates = aliases.get(action, ())
        for candidate in candidates:
            if candidate in tools:
                return candidate
        return self.reasoning.select_tool(specialist, tools)

    def _inputs(self, action: str, context: InferenceContext) -> tuple[str, ...]:
        base = []
        if context.capability_id:
            base.append("capability:" + context.capability_id)
        if context.source_revision:
            base.append("revision:" + context.source_revision)
        if context.failures and action in {"inspect_failure", "synthesize_repair"}:
            base.append("prior_failures")
        if context.memories and action in {"research_relevant_patterns", "recall_prior_repairs", "compare_evidence"}:
            base.append("recalled_memory")
        return tuple(base)

    @staticmethod
    def _reason(action: str, context: InferenceContext) -> str:
        if context.failures and "repair" in action:
            return "reuse failure evidence to avoid repeating a known bad strategy"
        if "research" in action:
            return "consult the evidence layer before inventing a local solution"
        if "synthesize" in action:
            return "convert the bounded task into an implementation artifact; fail closed without a generator"
        if "proposal" in action or "pr" in action:
            return "prepare a reviewable remote artifact without granting certification"
        return "derived from the mission objective, task constraints, and recalled state"

    @staticmethod
    def _id(context: InferenceContext, action: str, index: int) -> str:
        return "step-" + hashlib.sha256(
            f"{context.objective}|{context.capability_id}|{context.source_revision}|{action}|{index}".encode()
        ).hexdigest()[:12]
