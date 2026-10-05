from dataclasses import replace
from typing import Any, Callable

from .models import Experiment, Result
from .runner import run_experiment

def perturb_initial_state(experiment: Experiment, perturb: Callable[[Any], Any]) -> Result:
    """Repeat an experiment while changing only its initial state."""
    return run_experiment(
        replace(
            experiment,
            id=f"{experiment.id}-perturbed",
            initial_state=perturb(experiment.initial_state),
        )
    )
