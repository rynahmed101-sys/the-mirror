"""Conservative learning-loop planner.

The planner only decides whether a bounded cycle should act normally or pause for
investigation of repeated failures, repeated strategies, or conflicting lessons.
It never verifies, promotes, or mutates repository authority.
"""
from __future__ import annotations

from typing import Any

from automate.dev.learning import LearningError, LearningStore

ACTIONS = frozenset({
    "ACT",
    "REPRODUCE_FAILURE_PATTERN",
    "REPLAY_STRATEGY",
    "VERIFY_CONFLICT",
})


class LearningLoopError(ValueError):
    """Raised for invalid learning-loop inputs."""


def _plan(action: str, reason: str, task_kind: str, task_target: str, **extra: Any) -> dict[str, Any]:
    if action not in ACTIONS:
        raise LearningLoopError("unsupported learning action")
    payload = {
        "schema_version": "automate.learning_loop_plan.v1",
        "action": action,
        "reason": reason,
        "task_kind": task_kind,
        "task_target": task_target,
        "requires_external_verification": action != "ACT",
        **extra,
    }
    return payload


def plan_next_learning_action(
    store: LearningStore,
    *,
    task_kind: str,
    task_target: str,
) -> dict[str, Any]:
    try:
        conflicts = [
            item
            for item in store.lesson_conflicts()
            if item.get("scope", {}).get("task_kind") == task_kind
            and item.get("scope", {}).get("task_target") == task_target
        ]
        if conflicts:
            return _plan(
                "VERIFY_CONFLICT",
                "Conflicting adopted lessons share the exact task scope.",
                task_kind,
                task_target,
                conflicts=conflicts,
            )

        failures = [
            lesson
            for lesson in store.failure_lesson_candidates(min_repetitions=2)
            if lesson.get("scope", {}).get("task_kind") == task_kind
            and lesson.get("scope", {}).get("task_target") == task_target
        ]
        if failures:
            return _plan(
                "REPRODUCE_FAILURE_PATTERN",
                "Repeated failure evidence exists and must be challenged before another identical attempt.",
                task_kind,
                task_target,
                candidate_lessons=failures,
            )

        successes = [
            lesson
            for lesson in store.success_lesson_candidates(min_repetitions=3)
            if lesson.get("scope", {}).get("task_kind") == task_kind
            and lesson.get("scope", {}).get("task_target") == task_target
        ]
        if successes:
            return _plan(
                "REPLAY_STRATEGY",
                "Repeated success produced a candidate strategy that must beat the baseline before adoption.",
                task_kind,
                task_target,
                candidate_lessons=successes,
            )

        return _plan(
            "ACT",
            "No unresolved learning condition currently blocks the default strategy.",
            task_kind,
            task_target,
        )
    except LearningError as exc:
        raise LearningLoopError("learning-loop planning failed: " + str(exc)) from exc
