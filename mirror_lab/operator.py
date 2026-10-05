"""AI-facing orchestration facade for THE MIRROR.

This module deliberately contains orchestration, not scientific judgment.
An AI/plugin integration can use this facade instead of depending on internal
implementation details of individual lab modules.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from .analysis import trajectory_summary
from .ledger import EvidenceLedger
from .models import Experiment, Result
from .perturb import perturb_initial_state
from .runner import run_experiment


@dataclass
class LabOperator:
    """Thin machine-facing facade over the local scientific laboratory."""

    ledger: EvidenceLedger | None = None

    def run(self, experiment: Experiment, *, record: bool = True) -> Result:
        """Run an experiment and optionally record the raw result.

        Recording evidence does not imply that the result is scientifically
        correct. The ledger is an evidence store, not a verdict engine.
        """
        result = run_experiment(experiment)
        if record and self.ledger is not None:
            self.ledger.record(experiment, result)
        return result

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
