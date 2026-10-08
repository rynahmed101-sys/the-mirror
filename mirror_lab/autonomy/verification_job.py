"""Durable Chanfana client for Verification Engine jobs."""

from __future__ import annotations

import hashlib
from typing import Any, Mapping

from automate.dev.worker_client import (
    WorkerTransportError,
    dispatch_worker,
    read_worker_job,
)


class VerificationJobError(RuntimeError):
    pass


def build_verification_job(
    *,
    capability_id: str,
    repository: str,
    revision: str,
    branch: str,
    action_cycle_id: str,
    verifier_endpoint: str,
    parent_ids: list[str] | tuple[str, ...] = (),
    workflow_kind: str = "mirror_verification",
    payload: Mapping[str, Any] | None = None,
    deadline_ms: int = 120_000,
    max_response_bytes: int = 1_500_000,
) -> dict[str, Any]:
    if len(revision) != 40 or any(ch not in "0123456789abcdef" for ch in revision):
        raise VerificationJobError("verification job requires an exact lowercase revision SHA")
    if not branch or branch.startswith("/") or ".." in branch.split("/"):
        raise VerificationJobError("verification job requires a safe source branch")
    if not verifier_endpoint.startswith(("https://", "http://")):
        raise VerificationJobError("verification endpoint must be an explicit URL")
    if workflow_kind not in {
        "inventory", "reconciliation", "diagnosis", "repair",
        "mathematical_check", "computational_check", "ci_wait",
        "security_check", "mirror_verification", "evidence_assembly",
    }:
        raise VerificationJobError("unsupported verification workflow kind")

    limit_ms = min(900_000, max(1_000, int(deadline_ms)))
    limit_bytes = min(1_500_000, max(65_536, int(max_response_bytes)))
    request_id = "ver_" + hashlib.sha256(
        (
            repository
            + "\0"
            + branch
            + "\0"
            + revision
            + "\0"
            + capability_id
            + "\0"
            + action_cycle_id
            + "\0"
            + workflow_kind
        ).encode("utf-8")
    ).hexdigest()[:32]

    return {
        "schema_version": "automate.verification_job.v1",
        "request_id": request_id,
        "action_cycle_id": action_cycle_id,
        "workflow_kind": workflow_kind,
        "capability_id": capability_id,
        "source_revision": revision,
        "source_repository": repository,
        "source_branch": branch,
        "verifier_endpoint": verifier_endpoint,
        "limits": {
            "deadline_ms": limit_ms,
            "max_response_bytes": limit_bytes,
        },
        "payload": dict(payload or {}),
        "provenance": {
            "parent_ids": [str(x) for x in parent_ids],
            "requested_by": "automate",
        },
    }


def dispatch_verification_job(
    envelope: Mapping[str, Any],
    *,
    worker_url: str,
    worker_token: str,
    execute: bool = True,
    timeout: float = 30.0,
) -> dict[str, Any]:
    try:
        result = dispatch_worker(
            dict(envelope),
            url=worker_url,
            token=worker_token,
            execute=execute,
            timeout=timeout,
        )
    except WorkerTransportError as exc:
        raise VerificationJobError(str(exc)) from exc
    return result


def read_verification_result(
    job_id: str,
    *,
    worker_url: str,
    worker_token: str,
    timeout: float = 30.0,
) -> dict[str, Any]:
    try:
        result = read_worker_job(
            job_id,
            url=worker_url,
            token=worker_token,
            include_result=True,
            timeout=timeout,
        )
    except WorkerTransportError as exc:
        raise VerificationJobError(str(exc)) from exc
    return result
