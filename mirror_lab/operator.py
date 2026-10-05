"""AI-facing orchestration facade for THE MIRROR."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .analysis import trajectory_summary
from .ledger import EvidenceLedger
from .manifest import ExperimentManifest
from .models import Experiment, Result
from .perturb import perturb_initial_state
from .registry import ModelRegistry
from .runner import run_experiment


@dataclass
class LabOperator:
    """Thin machine-facing facade over the local scientific laboratory."""

    ledger: EvidenceLedger | None = None
    registry: ModelRegistry | None = None

    def run(self, experiment: Experiment, *, record: bool = True) -> Result:
        """Run an executable experiment and optionally record its evidence."""
        result = run_experiment(experiment)
        if record and self.ledger is not None:
            self.ledger.record(experiment, result)
        return result

    def run_manifest(
        self,
        manifest: ExperimentManifest,
        *,
        record: bool = True,
    ) -> Result:
        """Resolve and execute a declarative experiment manifest."""
        if self.registry is None:
            raise RuntimeError("A ModelRegistry is required to run a manifest.")
        model = self.registry.resolve(manifest.model.id, manifest.model.version)
        return self.run(manifest.bind(model), record=record)

    def load_and_run(
        self,
        path: str,
        *,
        record: bool = True,
    ) -> Result:
        """Load a JSON manifest and execute it through the registered model."""
        return self.run_manifest(ExperimentManifest.load(path), record=record)

    def perturb(
        self,
        experiment: Experiment,
        perturbation: Callable[[Any], Any],
        *,
        record: bool = True,
    ) -> Result:
        """Run a controlled initial-state perturbation."""
        result = perturb_initial_state(experiment, perturbation)
        if record and self.ledger is not None:
            self.ledger.record(experiment, result)
        return result

    @staticmethod
    def summarize(values: list[Any]) -> dict[str, Any]:
        """Return descriptive trajectory diagnostics only."""
        return trajectory_summary(values)

    def close(self) -> None:
        """Close the optional evidence ledger."""
        if self.ledger is not None:
            self.ledger.close()
