import copy
import random
from datetime import datetime, timezone
from typing import Any

from .models import Experiment, Observation, Result

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def run_experiment(experiment: Experiment) -> Result:
    """Execute a model and preserve observations without assigning scientific meaning."""
    if experiment.steps < 0:
        raise ValueError("steps must be non-negative")
    if experiment.dt <= 0:
        raise ValueError("dt must be positive")
    if experiment.seed is not None:
        random.seed(experiment.seed)

    started = _now()
    state: Any = copy.deepcopy(experiment.initial_state)
    observations: list[Observation] = []

    try:
        for index in range(experiment.steps + 1):
            time = index * experiment.dt
            measured = (
                dict(experiment.model.observe(state, time, experiment.parameters))
                if experiment.model.observe else {}
            )
            observations.append(
                Observation(index, time, copy.deepcopy(state), measured)
            )
            if index < experiment.steps:
                state = experiment.model.step(
                    state, experiment.dt, experiment.parameters
                )
        return Result(
            experiment.id, "completed", observations,
            {"steps": experiment.steps, "dt": experiment.dt, "seed": experiment.seed,
             "model": experiment.model.id, "model_version": experiment.model.version},
            started, _now()
        )
    except Exception as exc:
        return Result(
            experiment.id, "failed", observations,
            {"steps_requested": experiment.steps, "steps_completed": len(observations) - 1},
            started, _now(), f"{type(exc).__name__}: {exc}"
        )
