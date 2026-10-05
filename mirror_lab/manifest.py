"""Machine-readable experiment manifests for AI-operated runs."""

from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Mapping

from .models import Experiment, Hypothesis, Model


@dataclass(frozen=True)
class ModelRef:
    id: str
    version: str


@dataclass(frozen=True)
class ExperimentManifest:
    """Declarative experiment definition with no executable code."""

    id: str
    hypothesis: Hypothesis
    model: ModelRef
    initial_state: Any
    parameters: Mapping[str, Any] = field(default_factory=dict)
    steps: int = 100
    dt: float = 1.0
    seed: int | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "ExperimentManifest":
        hypothesis = value["hypothesis"]
        model = value["model"]
        return cls(
            id=str(value["id"]),
            hypothesis=Hypothesis(
                id=str(hypothesis["id"]),
                statement=str(hypothesis["statement"]),
                assumptions=tuple(hypothesis.get("assumptions", ())),
                expected_behavior=hypothesis.get("expected_behavior"),
            ),
            model=ModelRef(id=str(model["id"]), version=str(model["version"])),
            initial_state=value["initial_state"],
            parameters=dict(value.get("parameters", {})),
            steps=int(value.get("steps", 100)),
            dt=float(value.get("dt", 1.0)),
            seed=value.get("seed"),
            metadata=dict(value.get("metadata", {})),
        )

    @classmethod
    def load(cls, path: str | Path) -> "ExperimentManifest":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def canonical_json(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"), default=str)

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.canonical_json().encode("utf-8")).hexdigest()

    def bind(self, model: Model) -> Experiment:
        if model.id != self.model.id or model.version != self.model.version:
            raise ValueError(
                f"Model mismatch: manifest requests {self.model.id}@{self.model.version}, "
                f"received {model.id}@{model.version}"
            )
        return Experiment(
            id=self.id,
            hypothesis=self.hypothesis,
            model=model,
            initial_state=self.initial_state,
            parameters=self.parameters,
            steps=self.steps,
            dt=self.dt,
            seed=self.seed,
            metadata={**self.metadata, "manifest_hash": self.content_hash},
        )
