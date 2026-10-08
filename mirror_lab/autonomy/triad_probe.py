"""Non-mutating end-to-end contract probe for the Automate/Chanfana/Mirror triad.

The probe builds the same bounded envelopes used by the live system and checks
cross-system identity and authority invariants. It does not submit a job,
create a branch, modify a ledger, or contact an external service.
"""

from __future__ import annotations

from typing import Any, Mapping

from automate.dev.research import build_mirror_research_job
from automate.dev.verification_engine import build_request, mirror_verification_request
from automate.dev.worker import build_worker_packet


class TriadProbeError(ValueError):
    """Raised when a triad contract cannot be assembled safely."""


def run_triad_dry_run(
    capability_id: str,
    *,
    repository: str,
    revision: str,
    branch: str,
    action_cycle_id: str = "dryrun_cycle",
    mirror_endpoint: str = "https://example.invalid/research",
) -> dict[str, Any]:
    if len(revision) != 40 or any(ch not in "0123456789abcdef" for ch in revision):
        raise TriadProbeError("dry-run revision must be an exact lowercase 40-character commit SHA")
    if branch not in {"main", "engine"}:
        raise TriadProbeError("dry-run branch must be main or engine")

    worker = build_worker_packet(
        capability_id,
        repository=repository,
        base_sha_claim=revision,
        development_branch=branch,
    )
    worker_request_id = worker["packet"]["request_id"]

    verification = build_request(
        capability_id=capability_id,
        repository=repository,
        revision=revision,
        branch=branch,
        scope=["implementation", "tests", "provenance", "ci", "security"],
        action_cycle_id=action_cycle_id,
    ).to_dict()
    mirror = mirror_verification_request(
        request=build_request(
            capability_id=capability_id,
            repository=repository,
            revision=revision,
            branch=branch,
            scope=["mathematical", "computational"],
            action_cycle_id=action_cycle_id,
        ),
        hypothesis="bounded independent investigation of an unresolved mathematical or physical behavior",
        inputs={"revision": revision},
        assumptions=[],
        experiment_budget={"max_runtime_ms": 30000, "max_precision": 80},
    )
    research = build_mirror_research_job(
        capability={"id": capability_id, "name": capability_id},
        mirror_endpoint=mirror_endpoint,
        request_id=worker_request_id,
        correlation_id=verification["request_id"],
        max_results_per_provider=5,
        deadline_ms=120_000,
        max_response_bytes=1_000_000,
    )

    errors: list[str] = []
    if worker["packet"]["capability"]["id"] != capability_id:
        errors.append("worker capability identity mismatch")
    if worker["packet"]["repository"]["base_sha_claim"] != revision:
        errors.append("worker revision binding mismatch")
    if verification["capability_id"] != capability_id:
        errors.append("verification capability identity mismatch")
    if verification["revision"] != revision:
        errors.append("verification revision binding mismatch")
    if mirror["capability_id"] != capability_id:
        errors.append("Mirror verification capability identity mismatch")
    if mirror["source_revision"] != revision:
        errors.append("Mirror verification revision binding mismatch")
    if research["request_id"] != worker_request_id:
        errors.append("research request ID does not preserve durable worker identity")
    if research["provenance"]["capability_id"] != capability_id:
        errors.append("research provenance capability identity mismatch")
    if research["limits"]["max_results_per_provider"] > 10:
        errors.append("research provider limit escaped bound")
    if research["limits"]["deadline_ms"] > 900_000:
        errors.append("research deadline escaped bound")
    if research["limits"]["max_response_bytes"] > 1_500_000:
        errors.append("research response bound escaped")
    if verification.get("authority") is not None:
        errors.append("verification request unexpectedly minted authority")
    if research.get("authority") is not None:
        errors.append("research job unexpectedly minted authority")

    return {
        "schema_version": "automate.triad_dry_run.v1",
        "status": "PASS" if not errors else "FAIL",
        "mutations_performed": False,
        "authority_minted": False,
        "errors": errors,
        "contracts": {
            "worker_packet": worker,
            "verification_request": verification,
            "mirror_verification_request": mirror,
            "mirror_research_job": research,
        },
        "next_live_step": (
            "Submit the worker packet to Chanfana only after the normal supervisor gate passes."
            if not errors
            else "Stop and repair contract mismatch before external dispatch."
        ),
    }
