"""Deterministic supervisor decision for autonomous worker dispatch."""

from __future__ import annotations

import subprocess
import json
import os
import re
from typing import Any

from automate.dev.bookkeeping import find_merged_worker
from automate.dev.failure_recovery import exact_head_recovery_state
from automate.dev.inventory import (
    InventoryError,
    load_inventory,
    next_action,
    queue_snapshot,
)
from automate.dev.live import LiveAuditError, summarize_live
from automate.dev.worker import build_worker_packet


def observed_main_sha() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "refs/remotes/origin/main"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        try:
            result = subprocess.run(
                ["git", "rev-parse", "main"],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError):
            return None
    sha = result.stdout.strip()
    return sha if len(sha) == 40 else None


def _github_open_worker_prs(repository: str) -> list[dict[str, Any]]:
    env = os.environ.copy()
    if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
        return []
    result = subprocess.run(
        [
            "gh", "pr", "list", "--repo", repository, "--state", "open",
            "--base", "main", "--limit", "100",
            "--json", "number,headRefName,headRefOid,baseRefOid,body,title,isDraft,url",
        ],
        capture_output=True, text=True, check=False, env=env,
    )
    if result.returncode != 0:
        return []
    try:
        rows = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return [row for row in rows if isinstance(row, dict)]


def _pending_worker_pr(repository: str, capability_id: str, main_sha: str) -> dict[str, Any] | None:
    expected_prefix = "feat/" + capability_id + "-" + main_sha[:12]
    for pr in _github_open_worker_prs(repository):
        branch = str(pr.get("headRefName") or "")
        body = str(pr.get("body") or "")
        if (
            branch == expected_prefix
            and str(pr.get("baseRefName") or "main") == "main"
            and re.search(r"(?m)^- capability:\s*" + re.escape(capability_id) + r"\s*$", body)
            and str(pr.get("baseRefOid") or "") == main_sha
        ):
            return pr
    return None

def _pending_bookkeeping_pr(repository: str, capability_id: str, merge_sha: str) -> dict[str, Any] | None:
    expected_branch = "integrate/auto-bookkeep-" + merge_sha[:12]
    for pr in _github_open_worker_prs(repository):
        branch = str(pr.get("headRefName") or "")
        body = str(pr.get("body") or "")
        if (
            branch == expected_branch
            and "- automation_role: canonical_bookkeeping" in body
            and re.search(r"(?m)^- capability:\s*" + re.escape(capability_id) + r"\s*$", body)
            and re.search(r"(?m)^- merge_sha:\s*" + re.escape(merge_sha) + r"\s*$", body)
        ):
            return pr
    return None


def supervisor_snapshot(
    repository: str,
    *,
    live: bool = True,
    base_sha: str | None = None,
) -> dict[str, Any]:
    data = load_inventory()
    queue = queue_snapshot(data)

    live_state: dict[str, Any]
    if live:
        try:
            live_state = summarize_live(repository)
        except LiveAuditError as exc:
            return {
                "schema_version": "automate.supervisor.v1",
                "action": "stop",
                "reason": "Live GitHub audit could not be completed.",
                "errors": [str(exc)],
                "queue": queue,
                "can_dispatch": False,
            }
    else:
        live_state = {
            "repository": repository,
            "valid": False,
            "errors": ["live audit intentionally skipped"],
        }

    if not live_state["valid"]:
        return {
            "schema_version": "automate.supervisor.v1",
            "action": "stop",
            "reason": "Live repository state is not clean enough to dispatch a worker.",
            "errors": list(live_state["errors"]),
            "queue": queue,
            "live": live_state,
            "can_dispatch": False,
        }

    live_main_sha = base_sha or observed_main_sha()
    if not live_main_sha:
        return {
            "schema_version": "automate.supervisor.v1",
            "action": "stop",
            "reason": "Supervisor could not establish the exact current main SHA.",
            "errors": ["current main SHA is unavailable"],
            "queue": queue,
            "live": live_state,
            "can_dispatch": False,
        }

    action = next_action(data)
    if action["action"] == "implement":
        capability_id = action.get("capability_id")
        if capability_id:
            pending = _pending_worker_pr(repository, capability_id, live_main_sha)
            if pending:
                recovery = exact_head_recovery_state(repository, str(pending["headRefOid"]))
                if recovery["state"] == "retryable_failure":
                    return {
                        "schema_version": "automate.supervisor.v1",
                        "action": "retry_worker_verification",
                        "reason": "The worker head failed one verification attempt; rerun only the failed exact-head jobs before judging the proposal.",
                        "errors": [],
                        "queue": queue,
                        "live": live_state,
                        "can_dispatch": False,
                        "capability_id": capability_id,
                        "pr_number": int(pending["number"]),
                        "head_sha": str(pending["headRefOid"]),
                        "worker_pr": pending,
                        "recovery": recovery,
                    }
                if recovery["state"] == "repeated_failure":
                    return {
                        "schema_version": "automate.supervisor.v1",
                        "action": "quarantine_worker_pr",
                        "reason": "The worker head failed exact verification repeatedly; quarantine it and create a fresh repair attempt from authoritative main.",
                        "errors": [],
                        "queue": queue,
                        "live": live_state,
                        "can_dispatch": False,
                        "capability_id": capability_id,
                        "pr_number": int(pending["number"]),
                        "head_sha": str(pending["headRefOid"]),
                        "worker_pr": pending,
                        "recovery": recovery,
                    }
                if recovery["state"] != "success":
                    return {
                        "schema_version": "automate.supervisor.v1",
                        "action": "wait_worker_verification",
                        "reason": "Worker proposal is waiting for exact-head verification evidence.",
                        "errors": [],
                        "queue": queue,
                        "live": live_state,
                        "can_dispatch": False,
                        "capability_id": capability_id,
                        "pr_number": int(pending["number"]),
                        "head_sha": str(pending["headRefOid"]),
                        "worker_pr": pending,
                        "recovery": recovery,
                    }
                return {
                    "schema_version": "automate.supervisor.v1",
                    "action": "promote_worker_pr",
                    "reason": "A worker has published the earliest capability and exact-head Automate CI + Security Audit evidence is successful.",
                    "errors": [],
                    "queue": queue,
                    "live": live_state,
                    "can_dispatch": False,
                    "capability_id": capability_id,
                    "pr_number": int(pending["number"]),
                    "head_sha": str(pending["headRefOid"]),
                    "worker_pr": pending,
                    "recovery": recovery,
                }

            merged = find_merged_worker(repository, capability_id)
            if merged:
                bookkeeping = _pending_bookkeeping_pr(repository, capability_id, str(merged["merge_sha"]))
                if bookkeeping:
                    return {
                        "schema_version": "automate.supervisor.v1",
                        "action": "promote_bookkeeping_pr",
                        "reason": "The worker merge is already authoritative; finish the deterministic bookkeeping transition before dispatching the next capability.",
                        "errors": [],
                        "queue": queue,
                        "live": live_state,
                        "can_dispatch": False,
                        "capability_id": capability_id,
                        "pr_number": int(bookkeeping["number"]),
                        "head_sha": str(bookkeeping["headRefOid"]),
                        "bookkeeping_pr": bookkeeping,
                    }
                return {
                    "schema_version": "automate.supervisor.v1",
                    "action": "create_bookkeeping",
                    "reason": "A worker-generated capability has merged; canonical inventory and ledger bookkeeping is the next bounded transition.",
                    "errors": [],
                    "queue": queue,
                    "live": live_state,
                    "can_dispatch": False,
                    "capability_id": capability_id,
                    "worker_pr": merged,
                }

    if action["action"] != "implement":
        return {
            "schema_version": "automate.supervisor.v1",
            "action": action["action"],
            "reason": action["reason"],
            "errors": [],
            "queue": queue,
            "live": live_state,
            "can_dispatch": False,
        }

    capability_id = action.get("capability_id")
    if not capability_id:
        raise InventoryError("Supervisor received an implement action without a capability id.")

    packet = build_worker_packet(
        capability_id,
        repository=repository,
        base_sha_claim=live_main_sha,
    )
    return {
        "schema_version": "automate.supervisor.v1",
        "action": "dispatch",
        "reason": "The strict queue gate identifies one earliest ready capability and live GitHub state is clean.",
        "errors": [],
        "queue": queue,
        "live": live_state,
        "can_dispatch": True,
        "capability_id": capability_id,
        "worker_packet": packet,
    }
