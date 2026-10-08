"""Bounded local Git inspection and proposal tools.

Mirror may prepare an isolated proposal, but cannot push or mutate remote
Git authority directly.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


class GitTool:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def _run(self, args: list[str], timeout: int = 60) -> dict[str, Any]:
        completed = subprocess.run(
            ["git", *args],
            cwd=self.root,
            capture_output=True,
            text=True,
            timeout=min(max(timeout, 1), 120),
            check=False,
        )
        return {
            "command": ["git", *args],
            "returncode": completed.returncode,
            "stdout": completed.stdout[-100_000:],
            "stderr": completed.stderr[-100_000:],
        }

    def status(self) -> dict[str, Any]:
        return self._run(["status", "--short", "--branch"])

    def diff(self) -> dict[str, Any]:
        return self._run(["diff", "--", "."])

    def create_branch(self, name: str) -> dict[str, Any]:
        if not name or name in {"main", "master", "engine"} or ".." in name:
            raise ValueError("unsafe branch name")
        return self._run(["switch", "-c", name])

    def commit(self, message: str) -> dict[str, Any]:
        if not message.strip():
            raise ValueError("commit message is required")
        added = self._run(["add", "-A"])
        if added["returncode"] != 0:
            return added
        return self._run(["commit", "-m", message])

    def push(self, *args: str, **kwargs: Any) -> dict[str, Any]:
        raise PermissionError("Mirror cannot push or mutate remote Git authority directly")
