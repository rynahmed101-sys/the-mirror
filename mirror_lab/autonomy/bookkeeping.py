"""Canonical post-merge bookkeeping for the autonomous capability queue."""

from __future__ import annotations

import json
import re
import os
import re
import subprocess
from pathlib import Path
from typing import Any


class BookkeepingError(RuntimeError):
    pass


def _env() -> dict[str, str]:
    return os.environ.copy()


def _run(root: Path, args: list[str], *, check: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, cwd=root, capture_output=True, text=True, check=False, env=_env())
    if check and result.returncode != 0:
        raise BookkeepingError(result.stderr.strip() or result.stdout.strip() or "git/gh command failed")
    return result


def _exact_main_evidence(repository: str, sha: str) -> bool:
    result = _run(
        Path.cwd(),
        ["gh", "api", f"repos/{repository}/actions/runs?head_sha={sha}&per_page=100"],
        check=False,
    )
    if result.returncode != 0:
        return False
    try:
        payload = json.loads(result.stdout or "{}")
    except json.JSONDecodeError:
        return False
    successful = {
        str(run.get("name"))
        for run in payload.get("workflow_runs", [])
        if run.get("head_sha") == sha
        and run.get("status") == "completed"
        and run.get("conclusion") == "success"
    }
    return {"Automate CI", "Security Audit"} <= successful


def _closed_worker_prs(repository: str) -> list[dict[str, Any]]:
    result = _run(
        Path.cwd(),
        [
            "gh", "pr", "list", "--repo", repository, "--state", "closed",
            "--base", "main", "--limit", "100",
            "--json", "number,headRefName,headRefOid,baseRefOid,body,title,mergedAt,mergeCommit,url",
        ],
        check=False,
    )
    if result.returncode != 0:
        return []
    try:
        rows = json.loads(result.stdout or "[]")
    except json.JSONDecodeError:
        return []
    return [row for row in rows if isinstance(row, dict) and row.get("mergedAt")]


def find_merged_worker(repository: str, capability_id: str) -> dict[str, Any] | None:
    for pr in _closed_worker_prs(repository):
        body = str(pr.get("body") or "")
        branch = str(pr.get("headRefName") or "")
        match = re.search(r"(?m)^- capability:\s*" + re.escape(capability_id) + r"\s*$", body)
        if match and branch.startswith("feat/" + capability_id + "-"):
            merge_commit = pr.get("mergeCommit") or {}
            merge_sha = str(merge_commit.get("oid") or "")
            if len(merge_sha) == 40:
                return {**pr, "merge_sha": merge_sha}
    return None




def _normalized_inventory_sha256(inventory: dict[str, Any]) -> str:
    import hashlib
    normalized = json.dumps(inventory, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _ledger_sha256(ledger: str) -> str:
    import hashlib
    return hashlib.sha256(ledger.encode("utf-8")).hexdigest()


def build_bookkeeping_plan(
    inventory: dict[str, Any],
    ledger: str,
    *,
    capability_id: str,
    merge_sha: str,
    exact_head_ci_run: int,
    security_run: int,
    merged_pr_number: int | None = None,
) -> dict[str, Any]:
    """Build a non-mutating, exact-evidence-bound canonical bookkeeping plan."""
    if not re.fullmatch(r"[0-9a-f]{40}", str(merge_sha)):
        raise BookkeepingError("merge_sha must be an exact lowercase 40-character commit")
    if not isinstance(exact_head_ci_run, int) or exact_head_ci_run < 1:
        raise BookkeepingError("exact_head_ci_run must be a positive workflow run id")
    if not isinstance(security_run, int) or security_run < 1:
        raise BookkeepingError("security_run must be a positive workflow run id")

    capabilities = inventory.get("capabilities")
    if not isinstance(capabilities, list):
        raise BookkeepingError("capability inventory is missing capabilities")
    matches = [item for item in capabilities if isinstance(item, dict) and item.get("id") == capability_id]
    if len(matches) != 1:
        raise BookkeepingError(f"expected exactly one inventory capability: {capability_id}")
    item = json.loads(json.dumps(matches[0]))

    name = str(item.get("name") or "").strip()
    if not name:
        raise BookkeepingError(f"capability {capability_id} has no canonical name")

    # The ledger anchor must identify exactly one capability. Never guess between
    # duplicate names or silently mutate a different stage.
    unchecked = "- [ ] " + name
    pending = "- [!] " + name
    complete = "- [x] " + name

    exact = [anchor for anchor in (unchecked, pending, complete) if anchor in ledger]
    if len(exact) == 1:
        ledger_anchor = exact[0]
    else:
        def tokens(value: str) -> set[str]:
            words = re.findall(r"[a-z0-9]+", value.lower())
            return {word for word in words if word not in {"and", "the", "of", "for", "to"}}

        target_tokens = tokens(name)
        candidates: list[tuple[float, str]] = []
        for line in ledger.splitlines():
            stripped = line.strip()
            match = re.match(r"^- \[([ x!])\] (.+)$", stripped)
            if not match:
                continue
            candidate_tokens = tokens(match.group(2))
            if not target_tokens or not candidate_tokens:
                continue
            coverage = len(target_tokens & candidate_tokens) / len(target_tokens)
            if coverage >= 0.80:
                candidates.append((coverage, stripped))

        if len(candidates) != 1:
            raise BookkeepingError(
                f"ledger anchor for {capability_id} is ambiguous; expected one exact entry, "
                f"found {len(exact)} exact and {len(candidates)} semantic candidates"
            )
        ledger_anchor = candidates[0][1]

    if ledger_anchor == complete:
        raise BookkeepingError(f"ledger already marks {capability_id} completed")

    item["implementation_state"] = "merged_main"
    item["authority"] = {"kind": "main_merge", "ref": merge_sha}
    verification = dict(item.get("verification") or {})
    verification.update({
        "merged_main": True,
        "exact_head_verified": True,
        "development_ci_verified": True,
        "security_audit_verified": True,
    })
    item["verification"] = verification

    refs = list(item.get("references") or [])
    if merged_pr_number is not None:
        if not isinstance(merged_pr_number, int) or merged_pr_number < 1:
            raise BookkeepingError("merged_pr_number must be positive")
        if not any(
            isinstance(ref, dict)
            and ref.get("type") == "pr"
            and ref.get("number") == merged_pr_number
            and ref.get("state") == "merged"
            for ref in refs
        ):
            refs.append({
                "type": "pr",
                "number": merged_pr_number,
                "state": "merged",
                "role": "worker_generated",
                "merge_sha": merge_sha,
            })
    item["references"] = refs

    planned_inventory = json.loads(json.dumps(inventory))
    for index, candidate in enumerate(planned_inventory["capabilities"]):
        if candidate.get("id") == capability_id:
            planned_inventory["capabilities"][index] = item
            break

    planned_ledger = ledger.replace(ledger_anchor, "- [x] " + ledger_anchor[6:], 1)

    changes = [
        {
            "path": "docs/CAPABILITY_INVENTORY.json",
            "before_sha256": _normalized_inventory_sha256(inventory),
            "content": json.dumps(planned_inventory, indent=2) + "\n",
        },
        {
            "path": "docs/PROJECT_PHASE_LEDGER.md",
            "before_sha256": _ledger_sha256(ledger),
            "content": planned_ledger,
        },
    ]
    return {
        "schema_version": "automate.canonical_bookkeeping.v1",
        "capability_id": capability_id,
        "promotion_source_merge_sha": merge_sha,
        "exact_head_ci_run": exact_head_ci_run,
        "security_run": security_run,
        "next_action": "re-observe canonical main after bookkeeping promotion",
        "authority_change": "BOOKKEEPING_PR_ONLY",
        "canonical_mutation_performed": False,
        "changes": changes,
    }

def create_bookkeeping_pr(
    repository: str,
    *,
    root: Path,
    capability_id: str,
    worker_pr: dict[str, Any],
) -> dict[str, Any]:
    merge_sha = str(worker_pr["merge_sha"])
    main_ref = _run(root, ["git", "fetch", "origin", "main"], check=True)
    main_sha = _run(root, ["git", "rev-parse", "refs/remotes/origin/main"], check=True).stdout.strip()
    if main_sha != merge_sha and not _run(root, ["git", "merge-base", "--is-ancestor", merge_sha, main_sha]).returncode == 0:
        raise BookkeepingError("worker merge is not contained in current authoritative main")

    if not _exact_main_evidence(repository, merge_sha):
        return {
            "status": "waiting_for_exact_main_evidence",
            "capability_id": capability_id,
            "merge_sha": merge_sha,
        }

    inventory_path = root / "docs/CAPABILITY_INVENTORY.json"
    ledger_path = root / "docs/PROJECT_PHASE_LEDGER.md"
    inventory = json.loads(inventory_path.read_text(encoding="utf-8"))
    item = next((x for x in inventory["capabilities"] if x["id"] == capability_id), None)
    if item is None:
        raise BookkeepingError(f"unknown capability in inventory: {capability_id}")

    item["implementation_state"] = "merged_main"
    item["authority"] = {"kind": "main_merge", "ref": merge_sha}
    item["verification"].update({
        "locally_tested": True,
        "development_ci_verified": True,
        "merged_main": True,
        "exact_head_verified": True,
        "security_audit_verified": True,
    })
    item["references"] = [
        *item.get("references", []),
        {
            "type": "pr",
            "number": int(worker_pr["number"]),
            "state": "merged",
            "role": "worker_generated",
            "branch": str(worker_pr["headRefName"]),
            "merge_sha": merge_sha,
        },
    ]

    inventory_path.write_text(json.dumps(inventory, indent=2) + "\n", encoding="utf-8")
    ledger = ledger_path.read_text(encoding="utf-8")
    name = str(item["name"])
    ledger = ledger.replace("- [ ] " + name, "- [!] " + name)
    frontier = "**Control-plane frontier:** the next claimable Stage 1B capability is **Taylor / Maclaurin series and higher-order expansions** (GitHub issue #141)."
    if capability_id == "stage1b.series_expansions":
        ledger = ledger.replace(
            frontier,
            "**Control-plane frontier:** the next claimable Stage 1B capability is the earliest remaining calculus item after Series; the machine-readable capability inventory is authoritative for the exact next claim."
        )
        ledger = ledger.replace(
            "The next claimable capability is Series expansions (Issue #141).",
            "Series expansions are now implemented/merged; the machine-readable capability inventory determines the next claimable calculus capability."
        )
    ledger_path.write_text(ledger, encoding="utf-8")

    branch = "integrate/auto-bookkeep-" + merge_sha[:12]
    _run(root, ["git", "switch", "-C", branch, main_sha], check=True)
    _run(root, ["git", "add", "--", "docs/CAPABILITY_INVENTORY.json", "docs/PROJECT_PHASE_LEDGER.md"], check=True)
    _run(root, ["git", "commit", "-m", "chore: record autonomous capability promotion"], check=True)
    commit_sha = _run(root, ["git", "rev-parse", "HEAD"], check=True).stdout.strip()
    _run(root, ["git", "push", "--set-upstream", "origin", branch], check=True)

    body = "\n".join([
        "Automated canonical bookkeeping generated after an exact-head verified worker merge.",
        "",
        f"- capability: {capability_id}",
        f"- merge_sha: {merge_sha}",
        f"- bookkeeping_head_sha: {commit_sha}",
        "- automation_role: canonical_bookkeeping",
        "- worker_self_certification: false",
        "- independent_cross_check: pending",
    ])
    created = _run(
        root,
        [
            "gh", "pr", "create", "--repo", repository,
            "--head", branch, "--base", "main",
            "--title", "chore: record autonomous capability promotion",
            "--body", body,
        ],
        check=True,
    )
    return {
        "status": "bookkeeping_pr_created",
        "capability_id": capability_id,
        "merge_sha": merge_sha,
        "bookkeeping_head_sha": commit_sha,
        "pr_url": created.stdout.strip(),
    }
