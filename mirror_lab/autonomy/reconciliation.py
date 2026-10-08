"""Repository inventory and reconciliation planning.

This is the verifier's control-plane intelligence. It reports observed state,
compares it with claims, and produces candidate actions. It never promotes a
capability or edits Automate authority files.
"""
from __future__ import annotations

from typing import Any, Mapping

from automate.dev.inventory import load_inventory
from automate.dev.verification_engine import (
    FAILURE_CLASSES,
    diagnose_failure,
    gh_api,
    sha256,
)


def _workflow_summary(runs: list[Mapping[str, Any]], revision: str) -> dict[str, Any]:
    exact = [
        r for r in runs
        if r.get("head_sha") == revision
        and r.get("status") == "completed"
    ]
    success = [r for r in exact if r.get("conclusion") == "success"]
    security = [
        r for r in success
        if "security" in str(r.get("name", "")).lower()
        or "audit" in str(r.get("name", "")).lower()
    ]
    ci = [
        r for r in success
        if "ci" in str(r.get("name", "")).lower()
        or "test" in str(r.get("name", "")).lower()
    ]
    return {
        "exact_runs": [int(r["id"]) for r in exact if str(r.get("id", "")).isdigit()],
        "successful_ci_runs": [int(r["id"]) for r in ci if str(r.get("id", "")).isdigit()],
        "successful_security_runs": [int(r["id"]) for r in security if str(r.get("id", "")).isdigit()],
        "exact_head_ci_verified": bool(ci),
        "exact_head_security_verified": bool(security),
    }


def inventory_repository(repository: str) -> dict[str, Any]:
    main_ref = gh_api(f"/repos/{repository}/git/ref/heads/main")
    engine_ref = gh_api(f"/repos/{repository}/git/ref/heads/engine")
    main_sha = str(main_ref["object"]["sha"])
    engine_sha = str(engine_ref["object"]["sha"])

    main_commit = gh_api(f"/repos/{repository}/git/commits/{main_sha}")
    engine_commit = gh_api(f"/repos/{repository}/git/commits/{engine_sha}")
    main_tree_sha = str(main_commit["tree"]["sha"])
    engine_tree_sha = str(engine_commit["tree"]["sha"])
    main_tree = gh_api(f"/repos/{repository}/git/trees/{main_tree_sha}?recursive=1")
    engine_tree = gh_api(f"/repos/{repository}/git/trees/{engine_tree_sha}?recursive=1")
    main_paths = {
        str(e["path"]) for e in main_tree.get("tree", [])
        if e.get("type") == "blob"
    }
    engine_paths = {
        str(e["path"]) for e in engine_tree.get("tree", [])
        if e.get("type") == "blob"
    }

    prs = gh_api(f"/repos/{repository}/pulls?state=all&per_page=100")
    branches = gh_api(f"/repos/{repository}/branches?per_page=100")
    capability_by_pr: dict[int, list[dict[str, Any]]] = {}
    integration_by_pr: dict[int, dict[str, Any]] = {}
    if repository == "rynahmed101-sys/automate":
        try:
            inv = load_inventory()
        except Exception:
            inv = {}
        for item in inv.get("capabilities", []):
            for ref in item.get("references", []):
                if ref.get("type") == "pr" and isinstance(ref.get("number"), int):
                    capability_by_pr.setdefault(ref["number"], []).append({
                        "capability_id": item["id"],
                        "stage": item.get("stage"),
                        "state": item.get("implementation_state"),
                    })
        for ref in inv.get("integration_references", []):
            if isinstance(ref.get("number"), int):
                integration_by_pr[ref["number"]] = dict(ref)
    main_runs = gh_api(f"/repos/{repository}/actions/runs?branch=main&per_page=100")
    engine_runs = gh_api(f"/repos/{repository}/actions/runs?branch=engine&per_page=100")

    return {
        "repository": repository,
        "observed": {
            "main_sha": main_sha,
            "engine_sha": engine_sha,
            "main_tree_sha": str(main_tree.get("sha") or ""),
            "engine_tree_sha": str(engine_tree.get("sha") or ""),
            "main_path_count": len(main_paths),
            "engine_path_count": len(engine_paths),
            "engine_only_paths": sorted(engine_paths - main_paths),
            "main_only_paths": sorted(main_paths - engine_paths),
            "branch_names": [str(b.get("name")) for b in branches],
            "pull_requests": [
                {
                    "number": p.get("number"),
                    "state": p.get("state"),
                    "merged": bool(p.get("merged_at")),
                    "draft": bool(p.get("draft")),
                    "base_sha": p.get("base", {}).get("sha"),
                    "head_sha": p.get("head", {}).get("sha"),
                    "title": p.get("title"),
                    "updated_at": p.get("updated_at"),
                    "capabilities": capability_by_pr.get(int(p["number"]), []) if isinstance(p.get("number"), int) else [],
                    "integration_reference": integration_by_pr.get(int(p["number"])) if isinstance(p.get("number"), int) else None,
                }
                for p in prs
            ],
            "main_ci": _workflow_summary(main_runs.get("workflow_runs", []), main_sha),
            "engine_ci": _workflow_summary(engine_runs.get("workflow_runs", []), engine_sha),
        },
        "claim_vs_observation": {
            "main_is_authoritatively_verified": _workflow_summary(
                main_runs.get("workflow_runs", []), main_sha
            )["exact_head_ci_verified"],
            "engine_is_authoritatively_verified": False,
        },
    }


def classify_pull_request(
    pr: Mapping[str, Any],
    *,
    target_revision: str,
    earliest_stage: str | None = None,
    capability_stage: str | None = None,
) -> dict[str, Any]:
    findings: list[dict[str, Any]] = []
    base_sha = str(pr.get("base_sha") or "")
    if base_sha and base_sha != target_revision:
        findings.append({
            "kind": "stale_base",
            "severity": "high",
            "detail": f"PR base {base_sha} does not equal current target {target_revision}",
        })
    if pr.get("state") == "closed" and not pr.get("merged"):
        findings.append({
            "kind": "closed_unmerged",
            "severity": "medium",
            "detail": "historical candidate is not authority",
        })
    if earliest_stage and capability_stage and capability_stage > earliest_stage:
        findings.append({
            "kind": "later_stage",
            "severity": "medium",
            "detail": f"candidate stage {capability_stage} is later than current frontier {earliest_stage}",
        })
    status = "candidate_source" if findings else "candidate_reconciliation"
    return {
        "number": pr.get("number"),
        "status": status,
        "findings": findings,
        "diagnoses": [
            diagnose_failure(
                message=finding["detail"],
                evidence_kinds=[finding["kind"]],
            )
            for finding in findings
        ],
        "preserve_unique_work_until_compared": True,
    }


def build_reconciliation_plan(
    inventory: Mapping[str, Any],
    *,
    earliest_stage: str,
    target_repository: str,
) -> dict[str, Any]:
    observed = dict(inventory.get("observed", {}))
    prs = list(observed.get("pull_requests", []))
    classified = [
        classify_pull_request(
            pr,
            target_revision=str(observed.get("main_sha") or ""),
            earliest_stage=earliest_stage,
            capability_stage=(
                str((pr.get("capabilities") or [{}])[0].get("stage"))
                if pr.get("capabilities")
                else None
            ),
        )
        for pr in prs
    ]
    stale = [x for x in classified if any(f["kind"] == "stale_base" for f in x["findings"])]
    unresolved = []
    if not observed.get("main_ci", {}).get("exact_head_ci_verified"):
        unresolved.append("current main lacks a successful exact-head CI result")
    if not observed.get("main_ci", {}).get("exact_head_security_verified"):
        unresolved.append("current main lacks a successful exact-head Security Audit result")
    return {
        "schema_version": "automate.reconciliation_plan.v1",
        "repository": target_repository,
        "target_revision": observed.get("main_sha"),
        "earliest_stage": earliest_stage,
        "candidate_pull_requests": classified,
        "stale_candidates": [x["number"] for x in stale],
        "evidence_gaps": unresolved,
        "safe_actions": [
            "rebuild useful historical work onto the current target before promotion",
            "preserve unique tests and mathematical semantics during reconciliation",
            "run focused verification before broad CI when possible",
            "fail closed when exact revision or security evidence is missing",
        ],
        "unsafe_actions": [
            "blind merge of stale historical PRs",
            "marking later-stage work authoritative before earlier-stage frontier clears",
            "calling CI green from an older revision",
        ],
        "failure_classes_supported": list(FAILURE_CLASSES),
        "plan_fingerprint": sha256({
            "repository": target_repository,
            "target_revision": observed.get("main_sha"),
            "pull_requests": classified,
            "evidence_gaps": unresolved,
        }),
    }
