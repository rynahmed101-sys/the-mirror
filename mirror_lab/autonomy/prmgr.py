"""Controlled GitHub handoff for worker-generated capability branches."""

from __future__ import annotations

import json
import os
import subprocess
from typing import Any

from automate.dev.executor import WorkerExecutionError


def _github_env() -> dict[str, str]:
    env = os.environ.copy()
    if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
        raise WorkerExecutionError("GH_TOKEN or GITHUB_TOKEN is required for GitHub PR handoff")
    return env


def create_worker_pr(
    repository: str,
    *,
    branch: str,
    capability_id: str,
    title: str,
    base_sha: str,
    test_result: dict[str, Any],
    draft: bool = False,
) -> dict[str, Any]:
    if not repository or "/" not in repository:
        raise WorkerExecutionError("repository must be in owner/name form")
    if not branch.startswith("feat/"):
        raise WorkerExecutionError("refusing to create a PR from a non-worker branch")
    if len(base_sha) != 40:
        raise WorkerExecutionError("worker PR requires an exact 40-character base sha")

    body = "\\n".join(
        [
            "Automated capability implementation generated through Automate's bounded worker pipeline.",
            "",
            f"- capability: {capability_id}",
            f"- base_sha: {base_sha}",
            f"- authoritative_tests: {json.dumps(test_result.get('command', []))}",
            f"- authoritative_test_status: {test_result.get('status')}",
            "",
            "Worker output is untrusted. Certification, reconciliation bookkeeping, and merge decisions remain external to the worker.",
        ]
    )

    command = [
        "gh",
        "pr",
        "create",
        "--repo",
        repository,
        "--head",
        branch,
        "--base",
        "main",
        "--title",
        title,
        "--body",
        body,
    ]
    if draft:
        command.append("--draft")
    try:
        result = subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            env=_github_env(),
        )
    except OSError as exc:
        raise WorkerExecutionError(f"unable to invoke gh for PR creation: {exc}") from exc

    if result.returncode != 0:
        raise WorkerExecutionError(f"gh pr create failed: {result.stderr.strip()}")

    url = result.stdout.strip()
    if not url:
        raise WorkerExecutionError("gh pr create returned no PR URL")

    return {
        "repository": repository,
        "branch": branch,
        "capability_id": capability_id,
        "url": url,
        "draft": draft,
        "base_sha": base_sha,
    }
