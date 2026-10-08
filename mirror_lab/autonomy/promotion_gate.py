"""Authority-side promotion policy.

This module is deliberately separate from the evidence engine. It consumes
evidence and decides whether Automate may promote a capability. Workers,
Mirror, and the verifier cannot grant this decision.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class PromotionDecision:
    allowed: bool
    reasons: tuple[str, ...]
    required_evidence: tuple[str, ...]


def evaluate_promotion(
    *,
    packet: Mapping[str, Any],
    live_state: Mapping[str, Any],
    pr: Mapping[str, Any],
    prior_frontier_clear: bool,
) -> PromotionDecision:
    reasons: list[str] = []
    required: list[str] = []

    if packet.get("authority") != "EVIDENCE_ONLY":
        reasons.append("packet is not evidence-only")
    if packet.get("exact_commit_sha") != live_state.get("main_sha"):
        reasons.append("candidate revision is not the current Automate main revision")
    if packet.get("evidence_state") not in {"VERIFIED", "REPRODUCED"}:
        reasons.append("evidence state is not sufficient for authoritative promotion")
    if not live_state.get("exact_head_verified"):
        reasons.append("exact-head verification is missing")
        required.append("exact_head_verified")
    if not live_state.get("security_verified"):
        reasons.append("current Security Audit evidence is missing")
        required.append("security_verified")
    if packet.get("unresolved"):
        reasons.append("packet contains unresolved findings")
    if not pr.get("merged"):
        reasons.append("candidate PR is not merged into main")
    if pr.get("base_sha") and pr.get("base_sha") != live_state.get("main_sha"):
        reasons.append("candidate PR base is not the observed main revision")
    if not prior_frontier_clear:
        reasons.append("ledger frontier ordering is not clear")
        required.append("prior_frontier_clear")

    return PromotionDecision(not reasons, tuple(reasons), tuple(dict.fromkeys(required)))
