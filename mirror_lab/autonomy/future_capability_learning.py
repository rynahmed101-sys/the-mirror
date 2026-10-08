"""Durable Chanfana learning handoff for future capability candidates."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping

from automate.dev.worker_client import WorkerTransportError, _request_json, worker_api_url, worker_token


def build_future_capability_handoff(
    proposal: Mapping[str, Any],
    *,
    source_revision: str | None = None,
    correlation_id: str,
) -> dict[str, Any]:
    if proposal.get("authority") != "UNTRUSTED_FUTURE_CAPABILITY_PROPOSAL":
        raise WorkerTransportError("future capability must remain explicitly untrusted")
    if proposal.get("status") != "CANDIDATE":
        raise WorkerTransportError("only CANDIDATE future capabilities may enter learning memory")
    future_id = str(proposal.get("future_capability_id") or "")
    if not future_id:
        raise WorkerTransportError("future capability ID is required")
    request_id = "learn_" + hashlib.sha256(
        json.dumps(
            {
                "future_capability_id": future_id,
                "artifact_type": "research_proposal",
                "artifact": proposal,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    return {
        "schema_version": "automate.learning_handoff.v1",
        "authority": "UNTRUSTED_LEARNING_EVIDENCE",
        "request_id": request_id,
        "correlation_id": correlation_id,
        "source_revision": source_revision,
        "artifact_type": "research_proposal",
        "artifact": dict(proposal),
        "provenance": {
            "source_repo": "rynahmed101-sys/automate",
            "source_component": "future_capability_admission",
        },
    }


def persist_future_capability(
    proposal: Mapping[str, Any],
    *,
    source_revision: str | None,
    correlation_id: str,
    url: str | None = None,
    token: str | None = None,
    timeout: float = 30.0,
) -> dict[str, Any]:
    envelope = build_future_capability_handoff(
        proposal,
        source_revision=source_revision,
        correlation_id=correlation_id,
    )
    return _request_json(
        worker_api_url(url) + "/learning",
        token=worker_token(token),
        method="POST",
        body=envelope,
        timeout=timeout,
    )
