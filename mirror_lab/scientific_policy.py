"""Reference-first scientific work-order policy without novelty suppression."""

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


def build_work_order(
    objective: str,
    *,
    capability_id: str | None = None,
) -> ScientificWorkOrder:
    if not objective.strip():
        raise ValueError("objective is required")
    return ScientificWorkOrder(
        objective=objective,
        capability_id=capability_id,
        reference_required=True,
        novelty_allowed=True,
        reason=(
            "Ground the task in established/reference mathematics, physics, mature "
            "implementations, and known failure modes before evaluating frontier claims. "
            "References control evidence quality; they do not silently reject novelty."
        ),
    )


def rank_evidence(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(record: dict[str, Any]) -> tuple[int, float]:
        if record.get("established_reference") or record.get("reference_candidate"):
            priority = EvidencePriority.ESTABLISHED_REFERENCE
        elif record.get("kind") == "repository":
            priority = EvidencePriority.INDEPENDENT_IMPLEMENTATION
        elif record.get("kind") in {"paper", "preprint", "physics_literature", "work"}:
            priority = EvidencePriority.PRIMARY_LITERATURE
        elif record.get("kind") in {"experiment", "experimental_result"}:
            priority = EvidencePriority.EXPERIMENTAL_RESULT
        else:
            priority = EvidencePriority.FRONTIER_CLAIM
        return int(priority), -(float(record.get("score") or 0.0))

    return sorted(records, key=key)


def require_reference_pass(records: list[dict[str, Any]]) -> None:
    if not any(
        record.get("established_reference") or record.get("reference_candidate")
        for record in records
    ):
        raise ValueError(
            "No established/reference evidence found. Keep the claim UNKNOWN or "
            "retry research with broader sources before proposing promotion."
        )
