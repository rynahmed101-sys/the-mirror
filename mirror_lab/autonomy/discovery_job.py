"""Durable Automate -> Chanfana -> Mirror discovery client."""

from __future__ import annotations

import hashlib
from typing import Any, Mapping

from automate.dev.worker_client import WorkerTransportError, dispatch_worker, read_worker_job


class DiscoveryJobError(RuntimeError):
    pass


def build_discovery_job(
    *,
    grant: Mapping[str, Any],
    action_cycle_id: str,
    mirror_endpoint: str,
    parent_ids: list[str] | tuple[str, ...] = (),
    objective: str = (
        "Investigate one promising mathematical or physical idea, challenge it with evidence, "
        "and propose at most one new capability candidate when justified."
    ),
    max_tool_steps: int = 6,
    deadline_ms: int = 300_000,
    max_response_bytes: int = 1_500_000,
) -> dict[str, Any]:
    if grant.get("schema_version") != "automate.mirror_discovery_grant.v1":
        raise DiscoveryJobError("invalid discovery grant schema")
    if grant.get("canonical_mutation_allowed") is not False:
        raise DiscoveryJobError("discovery grant cannot permit canonical mutation")
    correlation_id = str(grant.get("correlation_id") or "")
    grant_id = str(grant.get("grant_id") or "")
    if not correlation_id or not grant_id:
        raise DiscoveryJobError("discovery grant identity is required")
    if not mirror_endpoint.startswith(("https://", "http://")):
        raise DiscoveryJobError("Mirror discovery endpoint must be an explicit URL")

    steps = min(8, max(1, int(max_tool_steps)))
    deadline = min(300_000, max(1_000, int(deadline_ms)))
    size = min(1_500_000, max(65_536, int(max_response_bytes)))
    request_id = "djob_" + hashlib.sha256(
        (action_cycle_id + "\0" + grant_id + "\0" + correlation_id + "\0" + mirror_endpoint).encode("utf-8")
    ).hexdigest()[:32]

    return {
        "schema_version": "mirror.discovery_job.v1",
        "request_id": request_id,
        "action_cycle_id": action_cycle_id,
        "execution_kind": "autonomous_discovery",
        "target": {"mirror_endpoint": mirror_endpoint},
        "discovery_grant": dict(grant),
        "objective": objective[:1000],
        "limits": {
            "max_tool_steps": steps,
            "deadline_ms": deadline,
            "max_response_bytes": size,
        },
        "provenance": {
            "parent_ids": [str(x) for x in parent_ids][:50],
            "requested_by": "automate",
        },
    }


def dispatch_discovery_job(envelope: Mapping[str, Any], *, worker_url: str, worker_token: str) -> dict[str, Any]:
    try:
        return dispatch_worker(
            dict(envelope),
            url=worker_url,
            token=worker_token,
            execute=True,
            timeout=30.0,
        )
    except WorkerTransportError as exc:
        raise DiscoveryJobError(str(exc)) from exc


def read_discovery_job(job_id: str, *, worker_url: str, worker_token: str) -> dict[str, Any]:
    try:
        return read_worker_job(
            job_id,
            url=worker_url,
            token=worker_token,
            include_result=True,
            timeout=30.0,
        )
    except WorkerTransportError as exc:
        raise DiscoveryJobError(str(exc)) from exc
