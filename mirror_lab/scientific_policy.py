"""Scientific work-order policy: established-first without novelty suppression."""
from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum
from typing import Any


class EvidencePriority(IntEnum):
    ESTABLISHED_REFERENCE = 0
    INDEPENDENT_IMPLEMENTATION = 1
    PRIMARY_LITERATURE = 2
    EXPERIMENTAL_RESULT = 3
    FRONTIER_CLAIM = 4


@dataclass(frozen=True)
class ScientificWorkOrder:
    objective: str
    capability_id: str | None = None
    reference_required: bool = True
    novelty_allowed: bool = True
    reason: str = ""


def build_work_order(objective: str, *, capability_id: str | None = None) -> ScientificWorkOrder:
    return ScientificWorkOrder(
        objective=objective,
        capability_id=capability_id,
        reference_required=True,
        novelty_allowed=True,
        reason=(
            "Ground the task in established/reference mathematics, physics, mature "
            "implementations, and known failure modes before evaluating frontier claims. "
            "References are controls and evidence, never hidden acceptance criteria."
        ),
    )


def rank_evidence(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def rank(record: dict[str, Any]) -> tuple[int, float]:
        if record.get("established_reference") or record.get("reference_candidate"):
            priority = EvidencePriority.ESTABLISHED_REFERENCE
        elif record.get("kind") == "repository":
            priority = EvidencePriority.INDEPENDENT_IMPLEMENTATION
        elif record.get("kind") in {"paper", "preprint", "physics_literature", "work"}:
            priority = EvidencePriority.PRIMARY_LITERATURE
        else:
            priority = EvidencePriority.FRONTIER_CLAIM
        return int(priority), -(float(record.get("score") or 0.0))

    return sorted(records, key=rank)


def require_reference_pass(records: list[dict[str, Any]]) -> None:
    """Fail closed when a reference-first work order was requested but no references were found."""
    if not any(r.get("established_reference") or r.get("reference_candidate") for r in records):
        raise ValueError(
            "No established/reference evidence found. Do not promote a frontier claim; "
            "either retry research with broader sources or explicitly record UNKNOWN."
        )
