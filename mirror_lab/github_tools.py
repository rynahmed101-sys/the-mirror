"""Bounded GitHub operations for Mirror.

Remote mutations are limited to creating/pushing Mirror-owned branches and opening
reviewable PRs. Merge, certification, ledger authority, and branch deletion stay
outside this tool. GitHub Actions supplies its normal GITHUB_TOKEN; no custom
Cloudflare/Chanfana secret is required by this module.
"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any


_BRANCH = re.compile(r"^mirror/[a-z0-9][a-z0-9._/-]{0,80}$")


class GitHubTool:
    def __init__(self, root: str | Path, repository: str = "rynahmed101-sys/automate") -> None:
        self.root = Path(root).resolve()
        self.repository = repository

    def _run(self, args: list[str], timeout: int = 120) -> dict[str, Any]:
        env = os.environ.copy()
        if not env.get("GH_TOKEN") and not env.get("GITHUB_TOKEN"):
            raise RuntimeError("GitHub Actions token is unavailable")
        completed = subprocess.run(
            args, cwd=self.root, env=env, capture_output=True, text=True,
            timeout=min(max(timeout, 1), 300), check=False,
        )
        return {
            "command": args,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-100_000:],
            "stderr": completed.stderr[-100_000:],
        }

    @staticmethod
    def validate_branch(name: str) -> str:
        if not _BRANCH.fullmatch(name):
            raise ValueError("remote branch must use mirror/<bounded-name>")
        return name

    def push_branch(self, name: str) -> dict[str, Any]:
        branch = self.validate_branch(name)
        current = self._run(["git", "branch", "--show-current"], timeout=10)
        if current["returncode"] != 0 or current["stdout"].strip() != branch:
            raise ValueError("workspace must be on the requested Mirror branch")
        return self._run(["git", "push", "--set-upstream", "origin", branch], timeout=180)

    def create_pr(self, branch: str, title: str, body: str) -> dict[str, Any]:
        branch = self.validate_branch(branch)
        if not title.strip() or len(title) > 200:
            raise ValueError("PR title is required and bounded")
        if not body.strip() or len(body) > 20_000:
            raise ValueError("PR body is required and bounded")
        return self._run([
            "gh", "pr", "create", "--repo", self.repository,
            "--base", "main", "--head", branch, "--title", title, "--body", body,
        ], timeout=120)

    def ci(self, revision: str) -> dict[str, Any]:
        if not re.fullmatch(r"[0-9a-f]{40}", revision):
            raise ValueError("revision must be an exact SHA")
        return self._run([
            "gh", "run", "list", "--repo", self.repository,
            "--commit", revision, "--limit", "30",
            "--json", "name,status,conclusion,headSha,databaseId",
        ], timeout=60)

    def repo_state(self) -> dict[str, Any]:
        return self._run([
            "gh", "api", f"repos/{self.repository}",
            "--jq", "{default_branch:.default_branch,visibility:.visibility,archived:.archived}",
        ], timeout=30)
