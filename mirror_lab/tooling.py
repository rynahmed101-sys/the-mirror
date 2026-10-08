"""Bounded provider-neutral tool registry for Mirror.

The registry is an authorization and provenance boundary around callable tools.
Execution itself remains bounded by each tool's contract and, for remote work,
by the Chanfana transport layer. Tool output is always untrusted evidence.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Mapping

from .reasoning import SpecialistName


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True)
class ToolContext:
    cycle_id: str
    mission_id: str
    objective: str
    specialist: SpecialistName
    capability_id: str | None = None
    source_revision: str | None = None
    authorization_granted: bool = False
    timeout_seconds: float = 30.0


@dataclass(frozen=True)
class ToolSpec:
    name: str
    specialist: SpecialistName
    handler: Callable[[Any, ToolContext], Any]
    description: str = ""
    timeout_seconds: float = 30.0
    authorization_required: bool = False
    mutating: bool = False


@dataclass(frozen=True)
class ToolResult:
    tool: str
    status: str
    output: Any = None
    provenance: str = ""
    evidence_classification: str = "OBSERVED"
    error: str | None = None
    started_at: str = ""
    finished_at: str = ""

    @property
    def succeeded(self) -> bool:
        return self.status == "succeeded"


class ToolRegistry:
    """Single registry for Mirror tools; no duplicate per-specialist registries."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        if not spec.name.strip():
            raise ValueError("tool name must not be empty")
        if spec.timeout_seconds <= 0:
            raise ValueError("tool timeout must be positive")
        if spec.name in self._tools:
            raise ValueError(f"tool already registered: {spec.name}")
        self._tools[spec.name] = spec

    def unregister(self, name: str) -> None:
        self._tools.pop(name, None)

    def get(self, name: str) -> ToolSpec:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise KeyError(f"unknown tool: {name}") from exc

    def names(self, *, specialist: SpecialistName | None = None) -> tuple[str, ...]:
        values = (
            spec.name
            for spec in self._tools.values()
            if specialist is None or spec.specialist is specialist
        )
        return tuple(sorted(values))

    def invoke(
        self,
        name: str,
        input_value: Any,
        context: ToolContext,
    ) -> ToolResult:
        spec = self.get(name)
        if context.timeout_seconds <= 0:
            raise ValueError("tool invocation timeout budget must be positive")
        if spec.authorization_required and not context.authorization_granted:
            return ToolResult(
                tool=name,
                status="authorization_denied",
                provenance=f"tool:{name}",
                evidence_classification="PROPOSED",
                error="tool requires explicit authorization",
                started_at=_now(),
                finished_at=_now(),
            )

        started = _now()
        try:
            output = spec.handler(input_value, context)
            return ToolResult(
                tool=name,
                status="succeeded",
                output=output,
                provenance=f"tool:{name};cycle:{context.cycle_id}",
                evidence_classification="OBSERVED",
                started_at=started,
                finished_at=_now(),
            )
        except Exception as exc:
            return ToolResult(
                tool=name,
                status="failed",
                provenance=f"tool:{name};cycle:{context.cycle_id}",
                evidence_classification="OBSERVED",
                error=f"{type(exc).__name__}: {exc}",
                started_at=started,
                finished_at=_now(),
            )

    def select_for(self, specialist: SpecialistName, available: Iterable[str]) -> str | None:
        candidates = []
        allowed = set(self.names(specialist=specialist))
        for name in dict.fromkeys(available):
            if name in allowed:
                candidates.append(name)
        return sorted(candidates)[0] if candidates else None

    def manifest(self) -> tuple[Mapping[str, object], ...]:
        return tuple(
            {
                "name": spec.name,
                "specialist": spec.specialist.value,
                "description": spec.description,
                "timeout_seconds": spec.timeout_seconds,
                "authorization_required": spec.authorization_required,
                "mutating": spec.mutating,
            }
            for spec in sorted(self._tools.values(), key=lambda item: item.name)
        )
