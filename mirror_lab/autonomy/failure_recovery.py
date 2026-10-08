"""Fail-closed recovery for autonomous worker PR verification failures."""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any


def _env() -> dict[str, str]:
    return os.environ.copy()


def _run(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, check=False, env=_env())


def _workflow_runs(repository: str, workflow: str, head_sha: str) -> list[dict[str, Any]]:
    result = _run([
        "gh", "run", "list", "--repo", repository, "--workflow", workflow,
        "--commit", head_sha, "--limit", "20",
        "--json", "databaseId,conclusion,attempt,status,headSha,name,url",
    ])
    if result.returncode != 0:
        return []
    try:
        payload = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return [row for row in payload if isinstance(row, dict) and row.get("headSha") == head_sha]


def exact_head_recovery_state(repository: str, head_sha: str) -> dict[str, Any]:
    workflows = ("Automate CI", "Security Audit")
    runs: dict[str, list[dict[str, Any]]] = {
        name: _workflow_runs(repository, name, head_sha) for name in workflows
    }
    failures: list[dict[str, Any]] = []
    pending = False
    missing = []
    for name, rows in runs.items():
        completed = [r for r in rows if r.get("status") == "completed"]
        if not completed:
            pending = True
            missing.append(name)
            continue
        latest = max(completed, key=lambda r: int(r.get("attempt") or 0))
        if latest.get("conclusion") != "success":
            failures.append({
                "workflow": name,
                "run_id": latest.get("databaseId"),
                "attempt": int(latest.get("attempt") or 0),
                "conclusion": latest.get("conclusion"),
                "url": latest.get("url"),
            })
        elif any(r.get("status") in {"queued", "in_progress", "waiting", "requested"} for r in rows):
            pending = True

    if pending:
        return {"state": "pending", "failures": failures, "missing": missing, "runs": runs}
    if failures:
        retryable = [f for f in failures if int(f["attempt"]) < 2 and isinstance(f.get("run_id"), int)]
        if retryable:
            return {"state": "retryable_failure", "failures": failures, "retryable": retryable, "runs": runs}
        return {"state": "repeated_failure", "failures": failures, "runs": runs}
    return {"state": "success", "failures": [], "runs": runs}


def rerun_failed_workflows(repository: str, failures: list[dict[str, Any]]) -> dict[str, Any]:
    requested: list[int] = []
    errors: list[str] = []
    for failure in failures:
        run_id = failure.get("run_id")
        if not isinstance(run_id, int):
            continue
        result = _run(["gh", "run", "rerun", str(run_id), "--repo", repository, "--failed"])
        if result.returncode == 0:
            requested.append(run_id)
        else:
            errors.append(result.stderr.strip() or result.stdout.strip() or f"rerun failed for {run_id}")
    return {"requested": requested, "errors": errors}


def quarantine_worker_pr(repository: str, pr_number: int, failures: list[dict[str, Any]]) -> dict[str, Any]:
    evidence = json.dumps(failures, sort_keys=True)
    body = (
        "AUTONOMOUS RECOVERY: this worker proposal failed exact-head verification twice. "
        "The proposal is quarantined and will not be promoted. A fresh repair attempt must "
        "be generated from authoritative main with this failure evidence.\n\n"
        "AUTONOMOUS_REPAIR_HOLD: attempt=2\n"
        "Failure evidence:\n" + evidence
    )
    result = _run([
        "gh", "pr", "close", str(pr_number), "--repo", repository,
        "--comment", body,
    ])
    if result.returncode != 0:
        return {"status": "quarantine_failed", "error": result.stderr.strip() or result.stdout.strip()}
    return {"status": "quarantined", "pr_number": pr_number, "failures": failures}


def failure_notes(failures: list[dict[str, Any]]) -> list[str]:
    notes = [
        "AUTONOMOUS_RECOVERY: prior worker proposal failed exact-head verification.",
        "AUTONOMOUS_RECOVERY: previous proposal is quarantined; do not reproduce its unchanged implementation.",
    ]
    for failure in failures:
        notes.append(
            "AUTONOMOUS_FAILURE_EVIDENCE: workflow="
            + str(failure.get("workflow"))
            + " attempt="
            + str(failure.get("attempt"))
            + " conclusion="
            + str(failure.get("conclusion"))
            + " run_id="
            + str(failure.get("run_id"))
        )
    return notes


def diagnose_worker_failure(
    repository: str,
    pr_number: int,
    failures: list[dict[str, Any]],
) -> dict[str, Any]:
    """Classify exact-head worker failures without treating diagnosis as certification."""
    notes: list[str] = []
    classes: set[str] = set()
    for failure in failures:
        workflow = str(failure.get("workflow") or "")
        conclusion = str(failure.get("conclusion") or "").lower()
        if conclusion in {"failure", "timed_out"}:
            classes.add("verification_failure")
            notes.append(f"EXACT_HEAD_FAILURE: {workflow} concluded {conclusion}.")
        elif conclusion in {"cancelled", "skipped"}:
            classes.add("workflow_state_failure")
            notes.append(f"WORKFLOW_STATE: {workflow} concluded {conclusion}.")
        else:
            classes.add("unknown_failure")
            notes.append(f"UNCLASSIFIED_FAILURE: {workflow} conclusion={conclusion or 'missing'}.")
    if not notes:
        classes.add("unknown_failure")
        notes.append("No actionable failure evidence was supplied.")
    return {
        "schema_version": "automate.worker_failure_diagnosis.v1",
        "repository": repository,
        "pr_number": pr_number,
        "classes": sorted(classes),
        "retryable": False,
        "notes": notes,
        "authority": "EVIDENCE_ONLY",
    }


def next_recovery_attempt(previous_branch: str) -> int:
    """Return the next bounded repair attempt number, starting at 2."""
    import re

    match = re.search(r"-repair(\d+)$", previous_branch.strip())
    if not match:
        return 2
    return max(2, int(match.group(1)) + 1)


def build_repair_hold(
    *,
    capability_id: str,
    source_sha: str,
    recovery_attempt: int,
    reason: str,
    repair_dispatch: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create the fail-closed durable hold used to prevent duplicate recovery."""
    if not isinstance(capability_id, str) or not capability_id.strip():
        raise ValueError("capability_id is required")
    if not isinstance(source_sha, str) or not __import__("re").fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("source_sha must be an exact lowercase 40-character SHA")
    if not isinstance(recovery_attempt, int) or recovery_attempt < 2:
        raise ValueError("recovery_attempt must be >= 2")
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError("reason is required")
    return {
        "schema_version": "automate.repair_hold.v1",
        "state": "REPAIR_HOLD",
        "scope": "capability",
        "capability_id": capability_id,
        "source_revision": source_sha,
        "recovery_attempt": recovery_attempt,
        "automatic_correction_required": True,
        "automatic_rectification_required": True,
        "reason": reason,
        "repair_dispatch": repair_dispatch,
        "resume_conditions": [
            "authoritative main remains at or advances from source_revision",
            "the failed proposal is quarantined",
            "a bounded recovery worker is dispatched from authoritative main",
            "new exact-head verification evidence is available",
        ],
        "dispatch_blocked": True,
    }


def find_quarantined_worker_handoff(
    repository: str,
    *,
    capability_id: str,
) -> dict[str, Any] | None:
    """Find a quarantined worker PR/repair hold for one capability."""
    result = _run([
        "gh", "pr", "list", "--repo", repository,
        "--state", "closed", "--base", "main", "--limit", "100",
        "--json", "number,headRefName,headRefOid,baseRefOid,body,title,mergedAt,url",
    ])
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "unable to inspect quarantined worker handoffs")
    try:
        rows = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise RuntimeError("GitHub returned invalid closed-PR JSON") from exc
    marker = "AUTONOMOUS_REPAIR_HOLD:"
    branch_prefix = "feat/" + capability_id + "-"
    for row in rows:
        if not isinstance(row, dict) or row.get("mergedAt"):
            continue
        body = str(row.get("body") or "")
        branch = str(row.get("headRefName") or "")
        if marker not in body or not branch.startswith(branch_prefix):
            continue
        source_sha = str(row.get("baseRefOid") or "")
        if not __import__("re").fullmatch(r"[0-9a-f]{40}", source_sha):
            source_sha = str(row.get("headRefOid") or "")
        match = __import__("re").search(r"AUTONOMOUS_REPAIR_HOLD:\s*attempt=(\d+)", body)
        attempt = max(2, int(match.group(1))) if match else 2
        return build_repair_hold(
            capability_id=capability_id,
            source_sha=source_sha,
            recovery_attempt=attempt,
            reason="A previous worker proposal was quarantined after repeated exact-head verification failure.",
            repair_dispatch=None,
        )
    return None
