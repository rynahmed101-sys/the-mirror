"""Fail-closed validation and isolated application of Mirror frontier proposals."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from automate.dev.executor import WorkerExecutionError, git_commit, run_approved_tests
from automate.dev.publisher import isolated_worker_worktree, worker_branch_name
from automate.dev.worker import _under_prefix


class FrontierProposalError(RuntimeError):
    pass


def validate_frontier_result(
    result: dict[str, Any],
    *,
    capability_id: str,
    base_sha: str,
) -> list[str]:
    errors: list[str] = []
    if result.get("schema_version") != "mirror.frontier_result.v1":
        errors.append("invalid frontier result schema")
    if result.get("authority") != "UNTRUSTED_MIRROR_PROPOSAL":
        errors.append("frontier result authority marker is invalid")
    if result.get("capability_id") != capability_id:
        errors.append("frontier result capability_id mismatch")
    if result.get("base_revision") != base_sha:
        errors.append("frontier result base revision mismatch")
    status = str(result.get("status") or "")
    if status in {
        "TEST_FAILED",
        "PATCH_REJECTED",
        "PATCH_APPLY_FAILED",
        "ENVIRONMENT_SETUP_FAILED",
        "FRONTIER_FAILED",
    }:
        errors.append("frontier result is not eligible for application: " + status)
    if status and status not in {"PROPOSED", "NO_CHANGE_PROPOSED"}:
        errors.append("frontier result status is not application-safe: " + status)
    proposal = result.get("proposal")
    if not isinstance(proposal, dict):
        errors.append("frontier result missing proposal")
    else:
        diff = proposal.get("diff")
        if not isinstance(diff, dict):
            errors.append("frontier result missing bounded diff evidence")
        elif not isinstance(diff.get("stdout"), str):
            errors.append("frontier result diff stdout must be text")
    return errors


def _changed_files(root: Path) -> list[str]:
    result = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=ACMRTUXB"],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise FrontierProposalError(
            "unable to inspect frontier worktree changes: " + result.stderr[-4000:]
        )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def build_frontier_commit(
    result: dict[str, Any],
    *,
    packet: dict[str, Any],
    repository_root: Path,
) -> dict[str, Any]:
    capability_id = packet.get("capability", {}).get("id")
    base_sha = packet.get("repository", {}).get("base_sha_claim")
    if not isinstance(capability_id, str) or not capability_id:
        raise FrontierProposalError("frontier packet has no capability id")
    if not isinstance(base_sha, str) or len(base_sha) != 40:
        raise FrontierProposalError("frontier packet has no exact base sha")

    errors = validate_frontier_result(
        result,
        capability_id=capability_id,
        base_sha=base_sha,
    )
    if errors:
        raise FrontierProposalError("; ".join(errors))

    diff = result["proposal"]["diff"]["stdout"]
    if not diff.strip():
        return {
            "status": "no_changes",
            "capability_id": capability_id,
            "base_sha": base_sha,
        }
    if len(diff.encode("utf-8")) > 2_000_000:
        raise FrontierProposalError("frontier diff exceeds bounded proposal size")

    branch_name = worker_branch_name(capability_id, base_sha) + "-mirror"
    if not branch_name.startswith("feat/"):
        raise FrontierProposalError("frontier branch violates worker branch prefix")

    try:
        with isolated_worker_worktree(
            repository_root,
            base_sha=base_sha,
            branch_name=branch_name,
        ) as worktree:
            check = subprocess.run(
                ["git", "apply", "--check", "--whitespace=error"],
                cwd=worktree,
                input=diff,
                text=True,
                capture_output=True,
                timeout=120,
                check=False,
            )
            if check.returncode != 0:
                raise FrontierProposalError(
                    "frontier diff failed isolated git apply --check: "
                    + check.stderr[-4000:]
                )

            applied = subprocess.run(
                ["git", "apply", "--whitespace=error"],
                cwd=worktree,
                input=diff,
                text=True,
                capture_output=True,
                timeout=120,
                check=False,
            )
            if applied.returncode != 0:
                raise FrontierProposalError(
                    "frontier diff failed isolated application: "
                    + applied.stderr[-4000:]
                )

            changed = _changed_files(worktree)
            if not changed:
                return {
                    "status": "no_changes",
                    "capability_id": capability_id,
                    "base_sha": base_sha,
                }

            constraints = packet.get("constraints") or {}
            allowed = list(constraints.get("allowed_path_prefixes") or [])
            forbidden = set(constraints.get("forbidden_paths") or [])
            if len(changed) > int(constraints.get("max_files") or 20):
                raise FrontierProposalError("frontier proposal exceeds the packet max_files limit")
            out_of_scope = [path for path in changed if not _under_prefix(path, allowed)]
            if out_of_scope:
                raise FrontierProposalError(
                    "frontier proposal contains files outside the capability boundary: "
                    + ", ".join(sorted(out_of_scope))
                )
            forbidden_touched = [path for path in changed if path in forbidden]
            if forbidden_touched:
                raise FrontierProposalError(
                    "frontier proposal touches forbidden control-plane files: "
                    + ", ".join(sorted(forbidden_touched))
                )

            try:
                tests = run_approved_tests(packet, root=worktree)
            except WorkerExecutionError as exc:
                raise FrontierProposalError(str(exc)) from exc

            if tests["status"] != "passed":
                return {
                    "status": "tests_failed",
                    "capability_id": capability_id,
                    "base_sha": base_sha,
                    "branch": branch_name,
                    "changed_files": changed,
                    "tests": tests,
                }

            commit_sha = git_commit(
                root=worktree,
                changed_files=changed,
                message="feat: implement " + str(packet["capability"]["name"]),
            )

    except FrontierProposalError:
        raise
    except WorkerExecutionError as exc:
        raise FrontierProposalError(str(exc)) from exc

    return {
        "status": "committed",
        "authority": "UNTRUSTED_MIRROR_PROPOSAL",
        "capability_id": capability_id,
        "base_sha": base_sha,
        "branch": branch_name,
        "commit_sha": commit_sha,
        "changed_files": changed,
        "tests": tests,
    }
