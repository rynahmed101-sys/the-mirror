"""Execute the installed production backlog against the live engine state.

This command is intentionally evidence-only. It picks the ledger-defined first
frontier, binds it to the live engine SHA, runs the verification engine, and
prints the resulting packet. It never promotes a capability.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from automate.dev.promotion_gate import evaluate_promotion
from automate.dev.verification_engine import (
    build_request,
    live_repository_snapshot,
    run_backlog_item,
    validate_packet_consistency,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repository",
        default="rynahmed101-sys/automate",
    )
    parser.add_argument(
        "--backlog",
        default="docs/VERIFICATION_BACKLOG.json",
    )
    args = parser.parse_args(argv)

    backlog = json.loads(Path(args.backlog).read_text(encoding="utf-8"))
    first = backlog["first_frontier"]
    snapshot = live_repository_snapshot(args.repository)
    revision = snapshot["engine_sha"]
    snapshot["requested_revision"] = revision
    result = run_backlog_item(
        capability_id=first["capability_id"],
        repository=args.repository,
        revision=revision,
        branch="engine",
        action_cycle_id="cycle_" + revision[:32],
        snapshot=snapshot,
        evidence_db=Path("data/verification-evidence.db"),
    )
    req_data = result["request"]
    request = build_request(
        capability_id=req_data["capability_id"],
        repository=req_data["repository"],
        revision=req_data["revision"],
        branch=req_data["branch"],
        scope=req_data["scope"],
        action_cycle_id=req_data["action_cycle_id"],
        parent_ids=req_data.get("parent_ids", []),
    )
    packet_errors = validate_packet_consistency(
        result["packet"],
        request=request,
        repository_state=snapshot,
    )
    promotion = evaluate_promotion(
        packet=result["packet"],
        live_state=snapshot,
        pr={"merged": False, "base_sha": snapshot.get("main_sha")},
        prior_frontier_clear=False,
    )
    packet_path = Path("data/verification-packets") / f"{result['packet']['packet_id']}.json"
    packet_path.parent.mkdir(parents=True, exist_ok=True)
    packet_path.write_text(
        json.dumps(result["packet"], indent=2, sort_keys=True, default=str),
        encoding="utf-8",
    )
    output = {
        "status": "evidence_generated" if not packet_errors else "evidence_generated_with_consistency_findings",
        "backlog_source": args.backlog,
        "first_frontier": first,
        "live_engine_sha": revision,
        "evidence_state": result["evidence_state"],
        "packet": result["packet"],
        "packet_consistency_findings": packet_errors,
        "promotion": {
            "allowed": promotion.allowed,
            "reasons": list(promotion.reasons),
            "required_evidence": list(promotion.required_evidence),
        },
        "packet_path": str(packet_path),
        "reconciliation": result["reconciliation"],
    }
    print(json.dumps(output, indent=2, sort_keys=True, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
