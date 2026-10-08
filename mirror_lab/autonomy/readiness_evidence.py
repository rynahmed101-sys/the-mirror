"""Readiness evidence helpers for independent autonomous-system gates."""

from __future__ import annotations
from typing import Any

def classify_local_evidence(*, contract_passed: bool, proposal_validation_passed: bool,
                            dry_run_passed: bool) -> dict[str, bool]:
    return {
        "worker_contract_tested": contract_passed,
        "worker_output_independently_validated": proposal_validation_passed,
        "end_to_end_dry_run_passed": dry_run_passed,
    }

def evidence_independence(evidence: dict[str, Any]) -> bool:
    records = evidence.get("independent_evidence", {})
    required = ("worker_contract_tested", "worker_output_independently_validated", "end_to_end_dry_run_passed")
    return all(isinstance(records.get(key), dict)
               and records[key].get("status") == "passed"
               and bool(records[key].get("reference"))
               for key in required)
