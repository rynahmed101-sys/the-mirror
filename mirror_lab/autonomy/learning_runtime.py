"""Runtime bridge between bounded development cycles and the local learning ledger.

Learning is telemetry first, policy second. Candidate memory never becomes authority by itself. Evidence is always revalidated on the current revision. This bridge records every cycle outcome,
derives candidate lessons from repeated observations, and exposes only explicitly
ADOPTED strategy lessons to future worker packets.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Iterable, Mapping

from urllib.parse import quote

from automate.dev.learning import LearningError, LearningStore, build_experience, validate_experience, validate_lesson, validate_discovery_proposal
from automate.dev.worker_client import WorkerTransportError, _request_json, worker_api_url, worker_token


class LearningRuntimeError(RuntimeError):
    """Raised when cycle learning cannot be recorded safely."""


DEFAULT_DB = Path("data/learning.db")


def open_learning_store(path: str | Path | None = None) -> LearningStore:
    return LearningStore(path or DEFAULT_DB)


def select_learning_strategy(
    store: LearningStore,
    *,
    task_kind: str,
    task_target: str,
) -> dict[str, Any]:
    try:
        return store.select_strategy(
            task_kind=task_kind,
            task_target=task_target,
        )
    except LearningError as exc:
        raise LearningRuntimeError("learning strategy selection failed: " + str(exc)) from exc


def record_cycle_experience(
    store: LearningStore,
    *,
    action_cycle_id: str,
    task_kind: str,
    task_target: str,
    strategy_id: str,
    outcome: str,
    observation: str,
    revision: str | None = None,
    evidence_refs: Iterable[Mapping[str, Any]] = (),
    failure_class: str | None = None,
    repository: str = "rynahmed101-sys/automate",
) -> dict[str, Any]:
    try:
        experience = build_experience(
            action_cycle_id=action_cycle_id,
            outcome=outcome,
            task_kind=task_kind,
            task_target=task_target,
            strategy_id=strategy_id,
            strategy_name=strategy_id,
            observation=observation,
            evidence_refs=[dict(x) for x in evidence_refs],
            failure_class=failure_class,
            repository=repository,
            revision=revision,
            correlation_id=action_cycle_id,
            reproducible=outcome != "unknown",
        )
        experience_id = store.add_experience(experience)
        candidate_lessons = []
        candidate_lessons.extend(store.failure_lesson_candidates(min_repetitions=2))
        candidate_lessons.extend(store.success_lesson_candidates(min_repetitions=3))
        stored_lessons = []
        for lesson in candidate_lessons:
            stored_lessons.append(store.add_lesson(lesson))
        return {
            "experience_id": experience_id,
            "experience": experience,
            "candidate_lessons_recorded": stored_lessons,
            "candidate_lessons": [
                store.get_lesson(lesson_id)
                for lesson_id in stored_lessons
                if isinstance(store.get_lesson(lesson_id), Mapping)
            ],
            "learning_snapshot": store.snapshot(),
        }
    except LearningError as exc:
        raise LearningRuntimeError("learning record rejected: " + str(exc)) from exc


def build_learning_handoff(
    artifact: Mapping[str, Any],
    *,
    artifact_type: str,
    request_id: str,
    correlation_id: str,
    source_revision: str | None,
    source_component: str = "autonomous",
) -> dict[str, Any]:
    allowed = {"learning_experience", "learning_lesson", "research_proposal"}
    if artifact_type not in allowed:
        raise LearningRuntimeError("unsupported learning artifact type")
    return {
        "schema_version": "automate.learning_handoff.v1",
        "authority": "UNTRUSTED_LEARNING_EVIDENCE",
        "request_id": request_id,
        "correlation_id": correlation_id,
        "source_revision": source_revision,
        "artifact_type": artifact_type,
        "artifact": dict(artifact),
        "provenance": {
            "source_repo": "rynahmed101-sys/automate",
            "source_component": source_component,
        },
    }


def persist_learning_artifact(
    artifact: Mapping[str, Any],
    *,
    artifact_type: str,
    request_id: str,
    correlation_id: str,
    source_revision: str | None,
    url: str | None = None,
    token: str | None = None,
) -> dict[str, Any]:
    try:
        handoff = build_learning_handoff(
            artifact,
            artifact_type=artifact_type,
            request_id=request_id,
            correlation_id=correlation_id,
            source_revision=source_revision,
        )
        return _request_json(
            worker_api_url(url) + "/learning",
            token=worker_token(token),
            method="POST",
            body=handoff,
            timeout=30.0,
        )
    except (WorkerTransportError, LearningRuntimeError) as exc:
        raise LearningRuntimeError("durable learning persistence failed: " + str(exc)) from exc


def read_remote_learning(
    *,
    url: str | None = None,
    token: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    if not 1 <= int(limit) <= 100:
        raise LearningRuntimeError("remote learning read limit must be between 1 and 100")
    try:
        payload = _request_json(
            worker_api_url(url) + "/learning?limit=" + str(int(limit)),
            token=worker_token(token),
            timeout=30.0,
        )
    except WorkerTransportError as exc:
        raise LearningRuntimeError("durable learning read failed: " + str(exc)) from exc
    artifacts = payload.get("artifacts")
    if payload.get("success") is not True or not isinstance(artifacts, list):
        raise LearningRuntimeError("durable learning service returned an invalid artifact list")
    return [item for item in artifacts if isinstance(item, Mapping)]


def sync_remote_learning(
    store: LearningStore,
    *,
    url: str | None = None,
    token: str | None = None,
    limit: int = 100,
) -> dict[str, Any]:
    artifacts = read_remote_learning(url=url, token=token, limit=limit)
    ingested = 0
    skipped = 0
    errors: list[str] = []
    for item in sorted(
        artifacts,
        key=lambda value: (
            0 if value.get("artifactType") == "learning_experience"
            else 1 if value.get("artifactType") == "learning_lesson"
            else 2
        ),
    ):
        artifact_type = item.get("artifactType")
        artifact = item.get("artifact")
        try:
            if not isinstance(artifact, Mapping):
                raise LearningRuntimeError("remote learning artifact is not an object")
            remote_hash = str(item.get("artifactSha256") or "")
            serialized = json.dumps(dict(artifact), separators=(",", ":"), ensure_ascii=False)
            local_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
            if not remote_hash or remote_hash != local_hash:
                raise LearningRuntimeError("remote learning artifact hash mismatch")
            if artifact_type == "learning_experience":
                errors_list = validate_experience(artifact)
                if errors_list:
                    raise LearningRuntimeError("; ".join(errors_list))
                store.add_experience(artifact)
            elif artifact_type == "learning_lesson":
                if artifact.get("status") != "CANDIDATE":
                    raise LearningRuntimeError("remote lesson promotion state is not trusted")
                errors_list = validate_lesson(artifact)
                if errors_list:
                    raise LearningRuntimeError("; ".join(errors_list))
                existing = store.get_lesson(str(artifact.get("lesson_id") or ""))
                if existing is not None and existing.get("status") != "CANDIDATE":
                    skipped += 1
                    continue
                store.add_lesson(artifact)
            elif artifact_type == "research_proposal":
                errors_list = validate_discovery_proposal(artifact)
                if errors_list:
                    raise LearningRuntimeError("; ".join(errors_list))
                store.add_discovery_candidate(artifact)
            else:
                skipped += 1
                continue
            ingested += 1
        except Exception as exc:
            skipped += 1
            errors.append(str(exc))
    return {"fetched": len(artifacts), "ingested": ingested, "skipped": skipped, "errors": errors}
