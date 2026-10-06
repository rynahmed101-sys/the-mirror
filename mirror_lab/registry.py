"""Explicit model registry used by the AI operator."""

from __future__ import annotations

from dataclasses import dataclass, field

from .models import Model


@dataclass
class ModelRegistry:
    """Resolve declarative model references to executable model objects."""

    _models: dict[tuple[str, str], Model] = field(default_factory=dict)

    def register(self, model: Model) -> None:
        key = (model.id, model.version)
        if key in self._models:
            raise ValueError(f"Model already registered: {model.id}@{model.version}")
        self._models[key] = model

    def resolve(self, model_id: str, version: str) -> Model:
        try:
            return self._models[(model_id, version)]
        except KeyError as exc:
            raise KeyError(f"Unknown model: {model_id}@{version}") from exc
