"""AI-facing frontier orchestration facade for THE MIRROR."""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Any, Callable, Protocol

from .analysis import trajectory_summary
from .ledger import EvidenceLedger
from .manifest import ExperimentManifest
from .models import Experiment, Result
from .perturb import perturb_initial_state
from .registry import ModelRegistry
from .runner import run_experiment


class Priority(IntEnum):
    """Lower values are more urgent."""

    REPAIR = 0
    CURRENT_WORK = 1
    LEDGER = 2
    AUTOMATE_REQUEST = 3
    DISCOVERY = 4


@dataclass(frozen=True)
class MissionContext:
    """Authoritative work context supplied by Automate."""

    cycle_id: str
    capability_id: str | None = None
    current_backlog: tuple[str, ...] = ()
    ledger_frontier: tuple[str, ...] = ()
    automate_requests: tuple[str, ...] = ()
    repair_required: bool = False
    discovery_allowed: bool = True
    ledger_hash: str | None = None

    @property
    def priority(self) -> Priority:
        if self.repair_required:
            return Priority.REPAIR
        if self.current_backlog:
            return Priority.CURRENT_WORK
        if self.ledger_frontier:
            return Priority.LEDGER
        if self.automate_requests:
            return Priority.AUTOMATE_REQUEST
        return Priority.DISCOVERY if self.discovery_allowed else Priority.AUTOMATE_REQUEST

    @property
    def focus(self) -> str:
        return {
            Priority.REPAIR: "repair",
            Priority.CURRENT_WORK: "current_backlog",
            Priority.LEDGER: "ledger_frontier",
            Priority.AUTOMATE_REQUEST: "automate_request",
            Priority.DISCOVERY: "discovery",
        }[self.priority]


class DecisionProvider(Protocol):
    """Pluggable LLM/local-agent decision provider."""

    def decide(self, system_prompt: str, context: dict[str, Any]) -> dict[str, Any]:
        ...


class FrontierOperator:
    """Decision layer above the scientific kernel.

    This layer can be backed by any capable AI provider. It may choose research,
    experiments, capability implementation, repairs, or discovery. It never
    becomes the authority for Automate certification.
    """

    ACTIONS = frozenset({
        "repair",
        "implement",
        "research",
        "experiment",
        "create_capability_candidate",
        "defer",
    })

    def __init__(self, provider: DecisionProvider) -> None:
        self.provider = provider

    def decide(self, mission: MissionContext, context: dict[str, Any]) -> dict[str, Any]:
        prompt = (
            "You are THE MIRROR frontier scientific operator. You are allowed to "
            "research public sources, inspect repository code, write and repair bounded "
            "capability code, design experiments, and investigate unconventional mathematics "
            "and physics. You are not the scientific authority and must never certify. "
            "Never mutate Automate's ledger, inventory, certification records, or Git history "
            "directly. Work priority is strict: repair, current backlog, ledger frontier, "
            "Automate request, then discovery. If higher-priority work exists, discovery waits. "
            "Never duplicate an existing capability_id. Before implementing a non-repair capability, establish a reference baseline from mature/established mathematics, physics, literature, or implementation evidence and record that grounding in context. A new capability is a candidate proposal "
            "until Automate evaluates and promotes it. Inspect relevant code/tests before edits, "
            "run focused verification after edits, preserve failure evidence, and report uncertainty."
        )
        decision = self.provider.decide(
            prompt,
            {**context, "mission_focus": mission.focus, "priority": int(mission.priority)},
        )
        action = str(decision.get("action", ""))
        if action not in self.ACTIONS:
            raise ValueError(f"Unsupported frontier action: {action}")
        allowed_by_priority = {
            Priority.REPAIR: {"repair", "defer"},
            Priority.CURRENT_WORK: {"implement", "repair", "defer"},
            Priority.LEDGER: {"implement", "research", "experiment", "defer"},
            Priority.AUTOMATE_REQUEST: {"implement", "repair", "research", "experiment", "defer"},
            Priority.DISCOVERY: {"research", "experiment", "create_capability_candidate", "defer"},
        }[mission.priority]
        if action not in allowed_by_priority:
            raise ValueError(f"Action {action} violates mission priority {mission.focus}")
        if action in {"implement", "create_capability_candidate"} and mission.priority != Priority.REPAIR and not context.get("reference_grounded", False):
            raise ValueError("Established/reference grounding is required before frontier implementation.")
        if mission.priority != Priority.DISCOVERY and action == "create_capability_candidate":
            raise ValueError("Discovery is blocked while higher-priority work exists.")
        return decision


@dataclass
class LabOperator:
    """Scientific execution facade retained for stable provider integrations."""

    ledger: EvidenceLedger | None = None
    registry: ModelRegistry | None = None

    def run(self, experiment: Experiment, *, record: bool = True) -> Result:
        result = run_experiment(experiment)
        if record and self.ledger is not None:
            self.ledger.record(experiment, result)
        return result

    def run_manifest(self, manifest: ExperimentManifest, *, record: bool = True) -> Result:
        if self.registry is None:
            raise RuntimeError("A ModelRegistry is required to run a manifest.")
        model = self.registry.resolve(manifest.model.id, manifest.model.version)
        return self.run(manifest.bind(model), record=record)

    def load_and_run(self, path: str, *, record: bool = True) -> Result:
        return self.run_manifest(ExperimentManifest.load(path), record=record)

    def perturb(
        self,
        experiment: Experiment,
        perturbation: Callable[[Any], Any],
        *,
        record: bool = True,
    ) -> Result:
        result = perturb_initial_state(experiment, perturbation)
        if record and self.ledger is not None:
            self.ledger.record(experiment, result)
        return result

    @staticmethod
    def summarize(values: list[Any]) -> dict[str, Any]:
        return trajectory_summary(values)

    def close(self) -> None:
        if self.ledger is not None:
            self.ledger.close()
