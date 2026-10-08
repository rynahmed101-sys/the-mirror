"""Live GitHub checks for the capability control plane."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
import subprocess
from typing import Any

from automate.dev.inventory import ACTIVE_STATES, load_inventory


class LiveAuditError(RuntimeError):
    """Raised when the live GitHub control-plane check cannot execute."""


def live_pull_requests(repository_full_name: str, *, limit: int = 100) -> list[dict[str, Any]]:
    env = os.environ.copy()
    if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
        raise LiveAuditError("GH_TOKEN or GITHUB_TOKEN is required for live capability audit.")
    command = [
        "gh", "pr", "list",
        "--repo", repository_full_name,
        "--state", "open",
        "--limit", str(limit),
        "--json", "number,headRefName,headRefOid,baseRefName,baseRefOid,isDraft,url,body",
    ]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, env=env)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise LiveAuditError(f"Unable to query live pull requests: {exc}") from exc
    try:
        payload = json.loads(result.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise LiveAuditError("GitHub pull-request query returned invalid JSON.") from exc
    if not isinstance(payload, list):
        raise LiveAuditError("GitHub pull-request query returned a non-list payload.")
    return [dict(item) for item in payload if isinstance(item, dict)]


def audit_live(
    repository_full_name: str,
    *,
    pull_requests: list[dict[str, Any]] | None = None,
    current_pr_number: int | None = None,
    base_branch: str | None = None,
) -> list[str]:
    data = load_inventory()
    target_base = base_branch or os.getenv("GITHUB_BASE_REF") or os.getenv("GITHUB_REF_NAME") or "main"
    effective_pr_number = current_pr_number
    if effective_pr_number is None and pull_requests is None and os.getenv("GITHUB_EVENT_NAME") == "pull_request":
        event_path = os.getenv("GITHUB_EVENT_PATH")
        try:
            event = json.loads(Path(event_path).read_text(encoding="utf-8")) if event_path else {}
            effective_pr_number = int(event["pull_request"]["number"])
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise LiveAuditError("Unable to determine the current pull-request number from GitHub event context.") from exc
    prs = live_pull_requests(repository_full_name) if pull_requests is None else pull_requests
    scoped_prs = [
        pr for pr in prs
        if pr.get("baseRefName") in (None, target_base)
        and (effective_pr_number is None or int(pr.get("number", -1)) == effective_pr_number)
    ]
    by_number = {int(pr["number"]): pr for pr in scoped_prs if "number" in pr}

    errors: list[str] = []
    inventory_refs: dict[int, list[tuple[str, dict[str, Any]]]] = {}
    inventory_branches: dict[str, list[str]] = {}
    integration_refs = {
        ref["number"]: ref
        for ref in data.get("integration_references", [])
        if isinstance(ref.get("number"), int)
    }
    control_plane_refs = {
        ref["number"]: ref
        for ref in data.get("control_plane_references", [])
        if isinstance(ref.get("number"), int)
    }

    for item in data["capabilities"]:
        if item["implementation_state"] not in ACTIVE_STATES:
            continue
        for ref in item["references"]:
            if ref.get("type") != "pr" or not str(ref.get("state", "")).startswith("open"):
                continue
            number = ref.get("number")
            if not isinstance(number, int):
                errors.append(f'{item["id"]}: active PR reference is missing an integer number')
                continue
            inventory_refs.setdefault(number, []).append((item["id"], ref))
            branch = ref.get("branch")
            if branch:
                inventory_branches.setdefault(branch, []).append(item["id"])
            pr = by_number.get(number)
            if pr is None:
                errors.append(f'PR #{number} is recorded active for {item["id"]} but is not open against main.')
                continue
            if pr.get("baseRefName") not in (None, data["branch_policy"]["feature_base"]):
                errors.append(f'PR #{number} for {item["id"]} targets {pr.get("baseRefName")}, not main.')
            if branch and pr.get("headRefName") != branch:
                errors.append(f'PR #{number} for {item["id"]} branch mismatch: inventory={branch}, live={pr.get("headRefName")}.')

    for branch, owners in inventory_branches.items():
        unique = sorted(set(owners))
        if len(unique) > 1:
            errors.append(f"Branch '{branch}' is claimed by multiple capabilities: {', '.join(unique)}")

    for number in sorted(set(inventory_refs).intersection(control_plane_refs)):
        errors.append(f"PR #{number} cannot be both capability-owned and control-plane-owned.")

    for number, pr in by_number.items():
        branch = pr.get("headRefName", "")
        if branch.startswith("feat/"):
            if target_base == "main":
                if number in control_plane_refs:
                    recorded = control_plane_refs[number]
                    if recorded.get("branch") and recorded.get("branch") != branch:
                        errors.append(
                            f"PR #{number} control-plane branch mismatch: "
                            f"inventory={recorded.get('branch')}, live={branch}."
                        )
                    if pr.get("baseRefName") not in (None, data["branch_policy"].get("feature_base", "main")):
                        errors.append(
                            f"PR #{number} control-plane lane targets {pr.get('baseRefName')}, "
                            f"not {data['branch_policy'].get('feature_base', 'main')}."
                        )
                elif number not in inventory_refs:
                    body = str(pr.get("body") or "")
                    worker_request = re.search(r"(?m)^- worker_request_id:\s*([A-Za-z0-9_.:-]{8,128})\s*$", body)
                    worker_base = re.search(r"(?m)^- base_sha:\s*([0-9a-f]{40})\s*$", body)
                    capability = re.search(r"(?m)^- capability:\s*([a-z0-9][a-z0-9_.-]*)\s*$", body)
                    capability_id = capability.group(1) if capability else ""
                    known_capability = any(
                        item.get("id") == capability_id
                        and item.get("implementation_state") not in {"merged_main", "superseded", "abandoned"}
                        for item in data.get("capabilities", [])
                    )
                    expected_prefix = "feat/" + capability_id + "-" if capability_id else ""
                    request_valid = bool(
                        worker_request
                        and re.fullmatch(r"wrk_[0-9a-f]{32}", worker_request.group(1))
                    )
                    pending_worker_handoff = bool(
                        known_capability
                        and request_valid
                        and worker_base
                        and worker_base.group(1) == str(pr.get("baseRefOid") or "")
                        and expected_prefix
                        and branch.startswith(expected_prefix)
                        and "Automated capability implementation generated through Automate's bounded worker pipeline." in body
                    )
                    pending_control_plane = bool(
                        (
                            "- automation_role: control_plane_autonomous_backlog_driver" in body
                            or "- automation_role: control_plane_self_correction" in body
                        )
                        and "- canonical_ledger_mutation: false" in body
                        and "- scientific_capability_implementation: false" in body
                    )
                    if not pending_worker_handoff and not pending_control_plane:
                        errors.append(
                            f"Open capability PR #{number} ({branch}) has no capability ownership reference."
                        )
                elif pr.get("baseRefName") not in (None, data["branch_policy"]["feature_base"]):
                    errors.append(
                        f"PR #{number} capability lane targets {pr.get('baseRefName')}, "
                        f"not {data['branch_policy']['feature_base']}."
                    )
            elif pr.get("baseRefName") not in (None, data["branch_policy"].get("control_plane_base", "engine")):
                errors.append(
                    f"PR #{number} control-plane lane targets {pr.get('baseRefName')}, "
                    f"not {data['branch_policy'].get('control_plane_base', 'engine')}."
                )
        if branch.startswith("integrate/") and target_base == "main":
            if number not in integration_refs:
                body = str(pr.get("body") or "")
                bookkeeping_capability = re.search(r"(?m)^- capability:\s*([a-z0-9][a-z0-9_.-]*)\s*$", body)
                merge_sha = re.search(r"(?m)^- merge_sha:\s*([0-9a-f]{40})\s*$", body)
                bookkeeping_role = "- automation_role: canonical_bookkeeping" in body
                pending_bookkeeping = bool(
                    bookkeeping_capability
                    and merge_sha
                    and bookkeeping_role
                    and merge_sha.group(1) == str(pr.get("baseRefOid") or "")
                    and any(
                        item.get("id") == bookkeeping_capability.group(1)
                        for item in data.get("capabilities", [])
                    )
                )
                if not pending_bookkeeping:
                    errors.append(f"Open reconciliation PR #{number} ({branch}) has no integration ownership reference.")
            elif pr.get("baseRefName") not in (None, data["branch_policy"]["feature_base"]):
                errors.append(
                    f"PR #{number} reconciliation lane targets {pr.get('baseRefName')}, "
                    f"not {data['branch_policy']['feature_base']}."
                )
            else:
                recorded_branch = integration_refs[number].get("branch")
                if recorded_branch and recorded_branch != branch:
                    errors.append(f"PR #{number} integration branch mismatch: inventory={recorded_branch}, live={branch}.")

    return errors


def summarize_live(
    repository_full_name: str,
    *,
    current_pr_number: int | None = None,
    base_branch: str | None = None,
) -> dict[str, Any]:
    errors = audit_live(
        repository_full_name,
        current_pr_number=current_pr_number,
        base_branch=base_branch,
    )
    return {
        "repository": repository_full_name,
        "valid": not errors,
        "errors": errors,
    }
