"""Build and optionally publish an isolated worker capability branch."""

from __future__ import annotations

import re
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from automate.dev.executor import WorkerExecutionError, execute_worker_proposal, git_commit


@contextmanager
def isolated_worker_worktree(
    repository_root: Path,
    *,
    base_sha: str,
    branch_name: str,
) -> Iterator[Path]:
    if not len(base_sha) == 40 or any(ch not in "0123456789abcdef" for ch in base_sha):
        raise WorkerExecutionError("invalid base sha for isolated worker worktree")
    if not branch_name.startswith("feat/"):
        raise WorkerExecutionError("worker branch must start with feat/")

    verify = subprocess.run(
        ["git", "cat-file", "-e", base_sha + "^{commit}"],
        cwd=repository_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if verify.returncode != 0:
        raise WorkerExecutionError(
            f"base sha is not available in local repository: {base_sha}"
        )

    tempdir = Path(tempfile.mkdtemp(prefix="automate-worker-"))
    added = subprocess.run(
        ["git", "worktree", "add", "--detach", str(tempdir), base_sha],
        cwd=repository_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if added.returncode != 0:
        tempdir.rmdir()
        raise WorkerExecutionError(f"git worktree add failed: {added.stderr.strip()}")

    switched = subprocess.run(
        ["git", "switch", "-c", branch_name],
        cwd=tempdir,
        capture_output=True,
        text=True,
        check=False,
    )
    if switched.returncode != 0:
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(tempdir)],
            cwd=repository_root,
            capture_output=True,
            text=True,
            check=False,
        )
        raise WorkerExecutionError(f"git switch failed: {switched.stderr.strip()}")

    try:
        yield tempdir
    finally:
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(tempdir)],
            cwd=repository_root,
            capture_output=True,
            text=True,
            check=False,
        )


def worker_branch_name(capability_id: str, base_sha: str | None = None, recovery_attempt: int | None = None) -> str:
    if not capability_id or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789_.-" for ch in capability_id):
        raise WorkerExecutionError("capability id is not safe for a worker branch")
    if base_sha is not None:
        if not len(base_sha) == 40 or any(ch not in "0123456789abcdef" for ch in base_sha):
            raise WorkerExecutionError("worker branch base sha must be a 40-character lowercase hex SHA")
        suffix = "-" + base_sha[:12]
        if recovery_attempt is not None:
            if recovery_attempt < 2:
                raise WorkerExecutionError("recovery attempt must be >= 2")
            suffix += "-repair" + str(recovery_attempt)
        return "feat/" + capability_id + suffix
    return "feat/" + capability_id


def build_worker_commit(
    packet: dict,
    result: dict,
    *,
    repository_root: Path,
    commit_message: str | None = None,
    enforce_inventory_scope: bool = True,
) -> dict:
    base_sha = packet.get("repository", {}).get("base_sha_claim")
    if not isinstance(base_sha, str):
        raise WorkerExecutionError("worker packet has no exact base sha")
    capability_id = packet.get("capability", {}).get("id")
    if not isinstance(capability_id, str):
        raise WorkerExecutionError("worker packet has no capability id")

    recovery_attempt = None
    for note in packet.get("context", {}).get("notes", []):
        match = re.fullmatch(r"AUTONOMOUS_RECOVERY_ATTEMPT:\s*(\d+)", str(note).strip())
        if match:
            recovery_attempt = int(match.group(1))
    branch_name = worker_branch_name(capability_id, base_sha, recovery_attempt)
    message = commit_message or (
        "feat: implement " + str(packet["capability"]["name"])
    )

    with isolated_worker_worktree(
        repository_root,
        base_sha=base_sha,
        branch_name=branch_name,
    ) as worktree:
        execution = execute_worker_proposal(
            packet,
            result,
            root=worktree,
            branch_name=branch_name,
            run_tests=True,
            enforce_inventory_scope=enforce_inventory_scope,
        )
        if execution["status"] != "ready_for_commit":
            return {
                "status": execution["status"],
                "branch": branch_name,
                "changed_files": execution["changed_files"],
                "tests": execution["tests"],
            }

        commit_sha = git_commit(
            root=worktree,
            changed_files=execution["changed_files"],
            message=message,
        )

    return {
        "status": "committed",
        "branch": branch_name,
        "commit_sha": commit_sha,
        "changed_files": execution["changed_files"],
        "tests": execution["tests"],
    }


def push_worker_branch(
    repository_root: Path,
    *,
    branch_name: str,
) -> str:
    if not branch_name.startswith("feat/"):
        raise WorkerExecutionError("refusing to push non-worker branch")

    result = subprocess.run(
        ["git", "push", "--set-upstream", "origin", branch_name],
        cwd=repository_root,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise WorkerExecutionError(f"git push failed: {result.stderr.strip()}")
    return branch_name
