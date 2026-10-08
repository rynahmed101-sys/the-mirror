"""Safe admission planning for capabilities discovered after the canonical ledger is exhausted.

A discovery candidate can become a durable future-capability proposal without
being allowed to mutate the canonical capability inventory or phase ledger.
The proposal records suggested ordering and explicit verification requirements.
Promotion into the authoritative ledger remains a separate, reviewable action.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Mapping


class CapabilityAdmissionError(ValueError):
    pass


def _id(value: str) -> str:
    if not re.fullmatch(r"[a-z0-9][a-z0-9_.-]*", value):
        raise CapabilityAdmissionError("candidate capability id is not machine-safe")
    return value


def build_future_capability_proposal(
    proposal: Mapping[str, Any],
    triage: Mapping[str, Any],
    *,
    suggested_stage: str = "DISCOVERY",
    suggested_order: int | None = None,
) -> dict[str, Any]:
    if proposal.get("authority") != "UNTRUSTED_RESEARCH_PROPOSAL":
        raise CapabilityAdmissionError("only untrusted research proposals are admissible inputs")
    if proposal.get("status") != "CANDIDATE":
        raise CapabilityAdmissionError("proposal must remain in CANDIDATE state")
    if triage.get("status") != "READY_FOR_INVESTIGATION":
        raise CapabilityAdmissionError("candidate is not ready for bounded investigation")

    candidate = proposal.get("candidate_capability")
    if not isinstance(candidate, Mapping):
        raise CapabilityAdmissionError("candidate_capability is required")

    cid = _id(str(candidate.get("id", "")).strip())
    dependencies = sorted({str(x).strip() for x in candidate.get("dependencies", []) if str(x).strip()})
    prerequisites = sorted({str(x).strip() for x in candidate.get("prerequisites", []) if str(x).strip()})

    if suggested_order is not None and (suggested_order < 0 or suggested_order > 2_147_483_647):
        raise CapabilityAdmissionError("suggested_order is outside the bounded integer range")

    body = {
        "schema_version": "automate.future_capability_proposal.v1",
        "proposal_id": str(proposal["proposal_id"]),
        "candidate_capability": {
            "id": cid,
            "name": str(candidate.get("name", "")).strip(),
            "summary": str(candidate.get("summary", "")).strip(),
            "dependencies": dependencies,
            "prerequisites": prerequisites,
        },
        "triage": dict(triage),
        "suggested_stage": str(suggested_stage),
        "suggested_order": suggested_order,
        "required_next_steps": [
            "bounded scientific investigation",
            "Automate Verification & Reconciliation Engine review",
            "independent evidence where required",
            "implementation proposal and regression tests",
            "explicit canonical-ledger promotion PR",
        ],
        "authority": "UNTRUSTED_FUTURE_CAPABILITY_PROPOSAL",
        "canonical_ledger_mutated": False,
        "status": "CANDIDATE",
    }
    body["future_capability_id"] = "fcap_" + hashlib.sha256(
        json.dumps(
            {
                "proposal_id": body["proposal_id"],
                "candidate": body["candidate_capability"],
                "suggested_stage": body["suggested_stage"],
                "suggested_order": body["suggested_order"],
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()[:32]
    return body
