from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Mapping

State = Any
StepFunction = Callable[[State, float, Mapping[str, Any]], State]
ObserveFunction = Callable[[State, float, Mapping[str, Any]], Mapping[str, Any]]

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()

@dataclass(frozen=True)
class Hypothesis:
    id: str
    statement: str
    assumptions: tuple[str, ...] = ()
    expected_behavior: str | None = None

@dataclass(frozen=True)
class Model:
    id: str
    version: str
    step: StepFunction
    observe: ObserveFunction | None = None
    description: str = ""

@dataclass(frozen=True)
class Experiment:
    id: str
    hypothesis: Hypothesis
    model: Model
    initial_state: State
    parameters: Mapping[str, Any] = field(default_factory=dict)
    steps: int = 100
    dt: float = 1.0
    seed: int | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

@dataclass(frozen=True)
class Observation:
    step: int
    time: float
    state: Any
    measured: Mapping[str, Any] = field(default_factory=dict)

@dataclass
class Result:
    experiment_id: str
    status: str
    observations: list[Observation]
    diagnostics: dict[str, Any]
    started_at: str
    finished_at: str | None = None
    error: str | None = None

    @property
    def final_state(self) -> Any:
        return self.observations[-1].state if self.observations else None
