"""Bounded intake and triage for Mirror-discovered capability candidates.

Discovery is deliberately non-authoritative. It can say a candidate is ready
for investigation, blocked on prerequisites, or collides with existing work,
but it cannot append to the canonical capability inventory.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Mapping

from jsonschema import Draft202012Validator

from automate.dev.inventory import load_inventory


ROOT = Path(__file__).resolve().parents[2]
TRIAGE_SCHEMA = ROOT / "schemas/automate-discovery-triage-v1.json"


class DiscoveryIntakeError(ValueError):
    """Raised for malformed or unsafe discovery candidates."""


def triage_candidate(proposal: Mapping[str, Any]) -> dict[str, Any]:
    if proposal.get("authority") != "UNTRUSTED_RESEARCH_PROPOSAL":
        raise DiscoveryIntakeError("discovery proposal must be explicitly untrusted")
    if proposal.get("status") != "CANDIDATE":
        raise DiscoveryIntakeError("discovery proposal must be in CANDIDATE state")
    candidate = proposal.get("candidate_capability")
    if not isinstance(candidate, Mapping):
        raise DiscoveryIntakeError("candidate_capability is required")

    candidate_id = str(candidate.get("id", "")).strip()
    name = str(candidate.get("name", "")).strip()
    summary = str(candidate.get("summary", "")).strip()
    dependencies = [str(x).strip() for x in candidate.get("dependencies", [])]
    prerequisites = [str(x).strip() for x in candidate.get("prerequisites", [])]
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]*", candidate_id):
        raise DiscoveryIntakeError("candidate id is not machine-safe")
    if not name or not summary:
        raise DiscoveryIntakeError("candidate name and summary are required")

    inventory = load_inventory()
    records = inventory["capabilities"]
    by_id = {item["id"]: item for item in records}
    known_id = candidate_id in by_id

    dependency_states = {
        dep: (
            by_id[dep]["implementation_state"]
            if dep in by_id
            else "unknown_dependency"
        )
        for dep in dependencies
    }
    prerequisite_states = {
        req: (
            by_id[req]["implementation_state"]
            if req in by_id
            else "unknown_prerequisite"
        )
        for req in prerequisites
    }

    unknown = sorted(
        dep for dep, state in {**dependency_states, **prerequisite_states}.items()
        if state.startswith("unknown")
    )
    nonterminal = sorted(
        dep for dep, state in {**dependency_states, **prerequisite_states}.items()
        if state not in {"unknown_dependency", "unknown_prerequisite"}
    )
    blockers = sorted(
        dep for dep in nonterminal
        if (
            dependency_states.get(dep, prerequisite_states.get(dep))
            not in {"merged_main", "superseded", "abandoned"}
        )
    )

    if known_id:
        status = "COLLIDES_WITH_CANONICAL_CAPABILITY"
        reason = "candidate id already exists in the canonical inventory; investigate as an extension, not a new capability"
    elif unknown:
        status = "BLOCKED_UNKNOWN_PREREQUISITES"
        reason = "candidate references prerequisites/dependencies that are not in the canonical inventory"
    elif blockers:
        status = "BLOCKED_INCOMPLETE_PREREQUISITES"
        reason = "candidate depends on nonterminal canonical work"
    else:
        status = "READY_FOR_INVESTIGATION"
        reason = "candidate has no unknown or nonterminal canonical prerequisites"

    result = {
        "schema_version": "automate.discovery_triage.v1",
        "proposal_id": str(proposal["proposal_id"]),
        "candidate_capability_id": candidate_id,
        "name": name,
        "summary": summary,
        "status": status,
        "reason": reason,
        "dependencies": dependency_states,
        "prerequisites": prerequisite_states,
        "recommended_action": (
            "run bounded scientific investigation and Verification & Reconciliation Engine review"
            if status == "READY_FOR_INVESTIGATION"
            else "retain candidate in discovery memory until the blocker is resolved"
        ),
        "canonical_inventory_mutated": False,
    }
    schema = json.loads(TRIAGE_SCHEMA.read_text(encoding="utf-8"))
    errors = [error.message for error in Draft202012Validator(schema).iter_errors(result)]
    if errors:
        raise DiscoveryIntakeError("triage payload violates machine contract: " + "; ".join(errors))
    return result


def extract_candidate_proposals(autopilot_result: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Extract only explicit capability-proposal tool results from Mirror output."""
    candidates: list[dict[str, Any]] = []
    trace = autopilot_result.get("trace", [])
    if not isinstance(trace, list):
        return candidates
    for step in trace:
        if not isinstance(step, Mapping) or step.get("tool") != "propose_new_capability":
            continue
        result = step.get("result")
        if not isinstance(result, Mapping):
            continue
        proposal = result.get("proposal")
        if isinstance(proposal, Mapping):
            candidates.append(dict(proposal))
    return candidates


def triage_mirror_autopilot_result(
    autopilot_result: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Triage each explicit Mirror candidate without changing canonical inventory."""
    results: list[dict[str, Any]] = []
    for proposal in extract_candidate_proposals(autopilot_result):
        results.append(triage_candidate(proposal))
    return results
