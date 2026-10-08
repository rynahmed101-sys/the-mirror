"""Evidence-gated engine release pin updater for the main scheduler."""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any


class EnginePinError(RuntimeError):
    pass


def _env() -> dict[str, str]:
    env = os.environ.copy()
    if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
        raise EnginePinError("GH_TOKEN or GITHUB_TOKEN is required")
    return env


def _run(root: Path, args: list[str], *, check: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        args,
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
        env=_env(),
    )
    if check and result.returncode != 0:
        raise EnginePinError(result.stderr.strip() or "git/gh command failed")
    return result


def _exact_main_pr_checks_verified(root: Path, repository: str, head_sha: str) -> bool:
    raw = _run(
        root,
        ["gh", "api", f"repos/{repository}/actions/runs?head_sha={head_sha}&per_page=100"],
        check=True,
    )
    payload = json.loads(raw.stdout or "{}")
    runs = payload.get("workflow_runs", []) if isinstance(payload, dict) else []
    successful = {
        str(run.get("name"))
        for run in runs
        if run.get("head_sha") == head_sha
        and run.get("status") == "completed"
        and run.get("conclusion") == "success"
    }
    # The Actions runs API reports workflow-level names. The main-targeted
    # `Automate CI` workflow contains the four Development matrix shards.
    return {"Automate CI", "Security Audit"} <= successful


def _successful_release_evidence(root: Path, repository: str, engine_sha: str) -> dict[str, Any]:
    raw = _run(
        root,
        ["gh", "api", f"repos/{repository}/actions/runs?head_sha={engine_sha}&per_page=100"],
        check=True,
    )
    payload = json.loads(raw.stdout or "{}")
    runs = payload.get("workflow_runs", []) if isinstance(payload, dict) else []
    successful = {
        str(run.get("name"))
        for run in runs
        if run.get("status") == "completed" and run.get("conclusion") == "success"
    }
    required = {"Automate Engine CI", "Security Audit"}
    missing = sorted(required - successful)
    return {
        "verified": not missing,
        "missing": missing,
        "successful": sorted(required & successful),
    }


def ensure_engine_pin(
    root: str | Path,
    repository: str,
    *,
    auto_update: bool = False,
    auto_merge: bool = False,
) -> dict[str, Any]:
    checkout = Path(root).resolve()
    pin_path = checkout / "docs/CONTROL_PLANE_ENGINE_PIN.json"
    if not pin_path.is_file():
        raise EnginePinError("control-plane engine pin file is missing")

    try:
        pin = json.loads(pin_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise EnginePinError("control-plane engine pin is invalid JSON") from exc

    if pin.get("schema_version") != "automate.control_plane_pin.v1":
        raise EnginePinError("control-plane engine pin schema is invalid")

    _run(checkout, ["git", "fetch", "origin", "main", "engine"], check=True)
    main_sha = _run(checkout, ["git", "rev-parse", "refs/remotes/origin/main"], check=True).stdout.strip()
    engine_sha = _run(checkout, ["git", "rev-parse", "refs/remotes/origin/engine"], check=True).stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{40}", main_sha) or not re.fullmatch(r"[0-9a-f]{40}", engine_sha):
        raise EnginePinError("main or engine tip is malformed")

    ancestor = _run(checkout, ["git", "merge-base", "--is-ancestor", main_sha, engine_sha])
    if ancestor.returncode != 0:
        return {
            "schema_version": "automate.engine_pin.v1",
            "state": "ENGINE_NOT_ALIGNED",
            "main_sha": main_sha,
            "engine_sha": engine_sha,
            "action": "await_engine_reconciliation",
        }

    evidence = _successful_release_evidence(checkout, repository, engine_sha)
    if not evidence["verified"]:
        return {
            "schema_version": "automate.engine_pin.v1",
            "state": "ENGINE_UNVERIFIED",
            "main_sha": main_sha,
            "engine_sha": engine_sha,
            "evidence": evidence,
            "action": "await_exact_engine_ci_and_security",
        }

    current_sha = pin.get("engine_sha")
    if current_sha == engine_sha:
        return {
            "schema_version": "automate.engine_pin.v1",
            "state": "PIN_ALIGNED",
            "main_sha": main_sha,
            "engine_sha": engine_sha,
            "evidence": evidence,
            "action": "none",
        }

    branch = f"chore/pin-engine-control-plane-{engine_sha[:12]}"
    if not re.fullmatch(r"chore/pin-engine-control-plane-[0-9a-f]{12}", branch):
        raise EnginePinError("generated pin branch is unsafe")

    if not auto_update:
        return {
            "schema_version": "automate.engine_pin.v1",
            "state": "PIN_UPDATE_REQUIRED",
            "main_sha": main_sha,
            "engine_sha": engine_sha,
            "previous_pin": current_sha,
            "evidence": evidence,
            "branch": branch,
            "action": "create_reviewable_pin_pr",
        }

    existing = _run(
        checkout,
        [
            "gh", "pr", "list",
            "--repo", repository,
            "--head", branch,
            "--base", "main",
            "--state", "open",
            "--json", "number,url,headRefName,headRefOid",
            "--limit", "10",
        ],
        check=True,
    )
    rows = json.loads(existing.stdout or "[]")
    if not isinstance(rows, list):
        raise EnginePinError("GitHub returned invalid pin PR data")

    if rows:
        pr = rows[0]
        if auto_merge:
            head_sha = str(pr.get("headRefOid") or "")
            if not re.fullmatch(r"[0-9a-f]{40}", head_sha) or not _exact_main_pr_checks_verified(checkout, repository, head_sha):
                return {
                    "schema_version": "automate.engine_pin.v1",
                    "state": "PIN_PR_OPEN",
                    "main_sha": main_sha,
                    "engine_sha": engine_sha,
                    "branch": branch,
                    "pr": pr,
                    "evidence": evidence,
                    "action": "awaiting_exact_head_main_ci_and_security",
                }
            merge = _run(
                checkout,
                [
                    "gh", "pr", "merge", str(pr["number"]),
                    "--repo", repository,
                    "--merge",
                    "--delete-branch=false",
                    "--match-head-commit", head_sha,
                ],
            )
            return {
                "schema_version": "automate.engine_pin.v1",
                "state": "PIN_PR_AUTO_MERGE_REQUESTED" if merge.returncode == 0 else "PIN_PR_OPEN",
                "main_sha": main_sha,
                "engine_sha": engine_sha,
                "branch": branch,
                "pr": pr,
                "merge_error": merge.stderr.strip() if merge.returncode != 0 else None,
                "evidence": evidence,
            }
        return {
            "schema_version": "automate.engine_pin.v1",
            "state": "PIN_PR_OPEN",
            "main_sha": main_sha,
            "engine_sha": engine_sha,
            "branch": branch,
            "pr": pr,
            "evidence": evidence,
        }

    pin["engine_sha"] = engine_sha
    pin["enabled"] = True
    pin["notes"] = (
        "Scheduler release pin updated only after engine reconciliation and exact-head "
        "Engine CI + Security Audit evidence."
    )

    _run(checkout, ["git", "switch", "-C", branch, main_sha], check=True)
    target = (checkout / "docs/CONTROL_PLANE_ENGINE_PIN.json").resolve()
    target.write_text(json.dumps(pin, indent=2) + "\n", encoding="utf-8")
    _run(checkout, ["git", "diff", "--check"], check=True)
    _run(checkout, ["git", "add", "--", "docs/CONTROL_PLANE_ENGINE_PIN.json"], check=True)
    _run(
        checkout,
        ["git", "commit", "-m", "chore: pin scheduler to verified engine release"],
        check=True,
    )
    new_sha = _run(checkout, ["git", "rev-parse", "HEAD"], check=True).stdout.strip()
    _run(checkout, ["git", "push", "--set-upstream", "origin", branch], check=True)

    body = "\n".join([
        "Evidence-gated scheduler engine pin update.",
        "",
        f"- authoritative_main_sha: {main_sha}",
        f"- verified_engine_sha: {engine_sha}",
        f"- previous_pin: {current_sha or 'null'}",
        "- automation_role: scheduler_release_pin",
        "- canonical_ledger_mutation: false",
        "- required_evidence: Automate Engine CI + Security Audit",
    ])
    created = _run(
        checkout,
        [
            "gh", "pr", "create",
            "--repo", repository,
            "--head", branch,
            "--base", "main",
            "--title", "chore: pin scheduler to verified engine release",
            "--body", body,
        ],
        check=True,
    )
    pr_url = created.stdout.strip()

    if auto_merge:
        listed = _run(
            checkout,
            [
                "gh", "pr", "list",
                "--repo", repository,
                "--head", branch,
                "--base", "main",
                "--state", "open",
                "--json", "number",
                "--limit", "1",
            ],
            check=True,
        )
        listed_rows = json.loads(listed.stdout or "[]")
        if listed_rows:
            # The PR was just created from this exact commit; use that immutable
            # SHA instead of requesting an omitted headRefOid field from gh.
            head_sha = new_sha
            if _exact_main_pr_checks_verified(checkout, repository, head_sha):
                merge = _run(
                    checkout,
                    [
                        "gh", "pr", "merge", str(listed_rows[0]["number"]),
                        "--repo", repository,
                            "--merge",
                        "--delete-branch=false",
                        "--match-head-commit", head_sha,
                    ],
                )
            else:
                merge = subprocess.CompletedProcess(["gh", "pr", "merge"], 1, "", "exact-head main CI/security evidence missing")
            
            return {
                "schema_version": "automate.engine_pin.v1",
                "state": "PIN_PR_AUTO_MERGE_REQUESTED" if merge.returncode == 0 else "PIN_PR_OPEN",
                "main_sha": main_sha,
                "engine_sha": engine_sha,
                "branch": branch,
                "pin_commit_sha": new_sha,
                "pr_url": pr_url,
                "evidence": evidence,
            }

    return {
        "schema_version": "automate.engine_pin.v1",
        "state": "PIN_PR_CREATED",
        "main_sha": main_sha,
        "engine_sha": engine_sha,
        "branch": branch,
        "pin_commit_sha": new_sha,
        "pr_url": pr_url,
        "evidence": evidence,
        "action": "await_pin_pr_ci_and_merge",
    }
