"""Create a reviewable canonical bookkeeping PR from a verified merge."""

from __future__ import annotations

import hashlib
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Mapping


class BookkeepingPrError(RuntimeError):
    """Raised when canonical bookkeeping cannot be safely published."""


def _env() -> dict[str, str]:
    env = os.environ.copy()
    if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
        raise BookkeepingPrError("GH_TOKEN or GITHUB_TOKEN is required for bookkeeping PR creation")
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
        raise BookkeepingPrError(result.stderr.strip() or "git/gh command failed")
    return result


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _existing_pr(repository: str, branch: str) -> dict[str, Any] | None:
    result = subprocess.run(
        [
            "gh", "pr", "list",
            "--repo", repository,
            "--head", branch,
            "--base", "main",
            "--state", "open",
            "--json", "number,url,headRefName,baseRefName,body",
            "--limit", "10",
        ],
        capture_output=True,
        text=True,
        check=False,
        env=_env(),
    )
    if result.returncode != 0:
        raise BookkeepingPrError(result.stderr.strip() or "unable to inspect existing bookkeeping PRs")
    import json
    rows = json.loads(result.stdout or "[]")
    if not isinstance(rows, list):
        raise BookkeepingPrError("GitHub returned invalid bookkeeping PR list")
    return rows[0] if rows else None


def create_bookkeeping_pr(
    repository_root: Path,
    repository: str,
    *,
    capability_id: str,
    merge_sha: str,
    merged_pr_number: int,
    exact_head_ci_run: int,
    security_run: int,
    plan: Mapping[str, Any],
) -> dict[str, Any]:
    if not repository or "/" not in repository:
        raise BookkeepingPrError("repository must be owner/name")
    if not __import__("re").fullmatch(r"[0-9a-f]{40}", merge_sha):
        raise BookkeepingPrError("merge_sha must be an exact lowercase 40-character commit")
    if not isinstance(merged_pr_number, int) or merged_pr_number < 1:
        raise BookkeepingPrError("merged_pr_number must be positive")
    if not plan.get("canonical_mutation_performed") is False:
        raise BookkeepingPrError("bookkeeping plan must be non-mutating until its reviewable PR is merged")
    changes = plan.get("changes")
    if not isinstance(changes, list) or len(changes) != 2:
        raise BookkeepingPrError("bookkeeping plan must contain exactly two canonical file changes")

    fetch = _run(repository_root, ["git", "fetch", "origin", "main"], check=True)
    ref = _run(repository_root, ["git", "rev-parse", "refs/remotes/origin/main"], check=True)
    current = ref.stdout.strip()
    if current != merge_sha:
        raise BookkeepingPrError(
            f"authoritative main moved during bookkeeping preparation: expected {merge_sha}, observed {current}"
        )

    branch = f"integrate/canonical-bookkeeping-{capability_id}-{merge_sha[:12]}"
    if not __import__("re").fullmatch(r"integrate/[a-z0-9_.-]+", branch):
        raise BookkeepingPrError("generated bookkeeping branch name is unsafe")

    existing = _existing_pr(repository, branch)
    if existing:
        return {
            "status": "existing_open",
            "branch": branch,
            "pr": existing,
            "merge_sha": merge_sha,
        }

    tmp = Path(tempfile.mkdtemp(prefix="automate-bookkeeping-"))
    added = _run(
        repository_root,
        ["git", "worktree", "add", "--detach", str(tmp), merge_sha],
        check=True,
    )
    try:
        switched = _run(tmp, ["git", "switch", "-c", branch], check=True)
        for change in changes:
            path = str(change.get("path") or "")
            if path not in {"docs/CAPABILITY_INVENTORY.json", "docs/PROJECT_PHASE_LEDGER.md"}:
                raise BookkeepingPrError(f"unexpected bookkeeping path: {path}")
            expected = str(change.get("before_sha256") or "")
            target = (tmp / path).resolve()
            try:
                target.relative_to(tmp.resolve())
            except ValueError as exc:
                raise BookkeepingPrError(f"bookkeeping path escapes worktree: {path}") from exc
            current_text = target.read_text(encoding="utf-8")
            observed_sha = _sha256_text(
                __import__("json").dumps(__import__("json").loads(current_text), sort_keys=True, separators=(",", ":"))
                if path.endswith(".json")
                else current_text
            )
            if path.endswith(".json"):
                # Inventory plans hash normalized JSON to avoid whitespace ambiguity.
                if observed_sha != expected:
                    raise BookkeepingPrError(f"inventory preimage mismatch for {path}")
            elif observed_sha != expected:
                raise BookkeepingPrError(f"ledger preimage mismatch for {path}")
            target.write_text(str(change.get("content") or ""), encoding="utf-8")
        _run(tmp, ["git", "diff", "--check"], check=True)
        _run(tmp, ["git", "add", "--", "docs/CAPABILITY_INVENTORY.json", "docs/PROJECT_PHASE_LEDGER.md"], check=True)
        commit = _run(
            tmp,
            [
                "git", "commit", "-m",
                f"chore: record verified promotion of {capability_id}",
            ],
            check=True,
        )
        pushed = _run(
            repository_root,
            ["git", "push", "--set-upstream", "origin", branch],
            check=True,
        )
        body = "\n".join([
            "Automated canonical bookkeeping proposal generated after an evidence-gated capability merge.",
            "",
            f"- capability: {capability_id}",
            f"- merged_pr: {merged_pr_number}",
            f"- merge_sha: {merge_sha}",
            f"- exact_head_ci_run: {exact_head_ci_run}",
            f"- security_run: {security_run}",
            "- automation_role: canonical_bookkeeping",
            "- canonical_mutation: proposed_in_reviewable_pr",
            "",
            "This PR contains only inventory/ledger bookkeeping. The merge SHA and evidence above are bound to the exact current main head.",
        ])
        pr = _run(
            repository_root,
            [
                "gh", "pr", "create",
                "--repo", repository,
                "--head", branch,
                "--base", "main",
                "--title", f"chore: record verified promotion of {capability_id}",
                "--body", body,
            ],
            check=True,
        )
        return {
            "status": "created",
            "branch": branch,
            "commit_sha": _run(tmp, ["git", "rev-parse", "HEAD"], check=True).stdout.strip(),
            "pr_url": pr.stdout.strip(),
            "merge_sha": merge_sha,
        }
    finally:
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(tmp)],
            cwd=repository_root,
            capture_output=True,
            text=True,
            check=False,
        )


def execute_bookkeeping_promotion(
    repository: str,
    pr_number: int,
    *,
    current_main_sha: str,
    execute: bool = False,
    verification_result: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Merge a canonical bookkeeping PR only after a fresh race-checked gate."""
    if not repository or "/" not in repository:
        raise BookkeepingPrError("repository must be owner/name")
    if not isinstance(pr_number, int) or pr_number < 1:
        raise BookkeepingPrError("bookkeeping PR number must be positive")
    if not __import__("re").fullmatch(r"[0-9a-f]{40}", current_main_sha):
        raise BookkeepingPrError("current_main_sha must be an exact lowercase 40-character commit")

    import json
    live_ref = json.loads(
        _run(
            Path("."),
            ["gh", "api", f"repos/{repository}/git/ref/heads/main"],
        ).stdout or "{}"
    )
    live_main_sha = str(live_ref.get("object", {}).get("sha") or "")
    if live_main_sha != current_main_sha:
        return {
            "state": "BLOCKED_BY_RACE",
            "pr_number": pr_number,
            "reason": "authoritative main moved before bookkeeping merge",
            "current_main_sha": current_main_sha,
            "observed_main_sha": live_main_sha,
        }

    pr_raw = _run(Path("."), ["gh", "api", f"repos/{repository}/pulls/{pr_number}"])
    if pr_raw.returncode != 0:
        raise BookkeepingPrError(pr_raw.stderr.strip() or "unable to inspect bookkeeping PR")
    pr = json.loads(pr_raw.stdout or "{}")

    gates = {
        "open": str(pr.get("state") or "").lower() == "open",
        "targets_main": pr.get("base", {}).get("ref") == "main",
        "base_current": pr.get("base", {}).get("sha") == current_main_sha,
        "mergeable": pr.get("mergeable") is True,
        "head_sha_valid": isinstance(pr.get("head", {}).get("sha"), str) and len(str(pr.get("head", {}).get("sha"))) == 40,
    }
    reasons = [name for name, passed in gates.items() if not passed]
    if reasons:
        return {
            "state": "BLOCKED",
            "pr_number": pr_number,
            "gates": gates,
            "reasons": reasons,
        }

    expected_head_sha = str(pr["head"]["sha"])
    fresh_ref = json.loads(
        _run(Path("."), ["gh", "api", f"repos/{repository}/git/ref/heads/main"]).stdout or "{}"
    )
    if str(fresh_ref.get("object", {}).get("sha") or "") != current_main_sha:
        return {
            "state": "BLOCKED_BY_RACE",
            "pr_number": pr_number,
            "reason": "authoritative main moved during bookkeeping gate",
        }

    if not execute:
        return {
            "state": "READY_TO_MERGE",
            "execution": "dry_run_ready",
            "pr_number": pr_number,
            "head_sha": expected_head_sha,
            "current_main_sha": current_main_sha,
            "gates": gates,
        }

    if os.getenv("AUTOMATE_AUTO_BOOKKEEP", "").strip().lower() not in {"1", "true", "yes"}:
        return {
            "state": "READY_TO_MERGE",
            "execution": "blocked_by_governance",
            "pr_number": pr_number,
            "head_sha": expected_head_sha,
            "current_main_sha": current_main_sha,
            "gates": gates,
            "reasons": ["AUTOMATE_AUTO_BOOKKEEP is not enabled."],
        }

    fresh_pr_raw = _run(Path("."), ["gh", "api", f"repos/{repository}/pulls/{pr_number}"])
    if fresh_pr_raw.returncode != 0:
        raise BookkeepingPrError(fresh_pr_raw.stderr.strip() or "unable to re-read bookkeeping PR")
    fresh_pr = json.loads(fresh_pr_raw.stdout or "{}")
    if fresh_pr.get("head", {}).get("sha") != expected_head_sha or fresh_pr.get("base", {}).get("sha") != current_main_sha:
        return {
            "state": "BLOCKED_BY_RACE",
            "pr_number": pr_number,
            "reason": "bookkeeping PR changed during merge gate",
        }

    merged = _run(
        Path("."),
        [
            "gh", "pr", "merge", str(pr_number),
            "--repo", repository,
            "--merge",
            "--delete-branch=false",
            "--match-head-commit", expected_head_sha,
        ],
    )
    if merged.returncode != 0:
        raise BookkeepingPrError(merged.stderr.strip() or "GitHub refused bookkeeping promotion")
    return {
        "state": "MERGED_PENDING_EXACT_MAIN_VERIFICATION",
        "execution": "merged",
        "pr_number": pr_number,
        "expected_head_sha": expected_head_sha,
        "merge_output": merged.stdout.strip(),
        "verification_result_supplied": verification_result is not None,
    }
