"""Bounded, expiring permission for Mirror idle discovery.

A discovery grant authorizes exploration, not scientific truth or canonical
mutation. Automate issues it only when the strict canonical queue is empty.
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping


class DiscoveryGrantError(ValueError):
    pass


def build_discovery_grant(
    control: Mapping[str, Any],
    *,
    correlation_id: str,
    now: datetime | None = None,
    ttl_seconds: int = 900,
) -> dict[str, Any]:
    if control.get("schema_version") != "automate.operating_mode.v1":
        raise DiscoveryGrantError("control payload is not an Automate operating-mode contract")
    if control.get("mode") != "DISCOVERY_READY" or control.get("mirror_discovery_allowed") is not True:
        raise DiscoveryGrantError("Mirror discovery is not allowed until the canonical queue is exhausted")
    queue = control.get("queue")
    if not isinstance(queue, Mapping) or queue.get("next_action", {}).get("action") != "none":
        raise DiscoveryGrantError("discovery grant requires an empty strict canonical queue")
    if not re.fullmatch(r"[A-Za-z0-9_.:-]{8,128}", correlation_id):
        raise DiscoveryGrantError("correlation_id is not machine-safe")
    if ttl_seconds < 60 or ttl_seconds > 86_400:
        raise DiscoveryGrantError("discovery grant TTL is outside the bounded range")

    issued = now or datetime.now(timezone.utc)
    if issued.tzinfo is None:
        issued = issued.replace(tzinfo=timezone.utc)
    expires = issued + timedelta(seconds=ttl_seconds)
    grant_seed = {
        "correlation_id": correlation_id,
        "queue": queue,
        "issued_at": issued.isoformat(),
        "expires_at": expires.isoformat(),
    }
    grant_id = "dgrant_" + hashlib.sha256(
        json.dumps(grant_seed, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:32]

    return {
        "schema_version": "automate.mirror_discovery_grant.v1",
        "grant_id": grant_id,
        "authority": "UNTRUSTED_EXPLORATION_PERMISSION",
        "issuer": "automate",
        "correlation_id": correlation_id,
        "issued_at": issued.isoformat(),
        "expires_at": expires.isoformat(),
        "max_candidates": 1,
        "allowed_actions": [
            "research_world",
            "run_bounded_experiment",
            "challenge_existing_models",
            "propose_new_capability",
        ],
        "forbidden_actions": [
            "mutate_canonical_inventory",
            "mutate_phase_ledger",
            "merge_pull_request",
            "certify_capability",
            "change_verification_authority",
            "change_epistemic_policy",
        ],
        "canonical_mutation_allowed": False,
    }
