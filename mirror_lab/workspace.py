"""Bounded repository workspace tools."""

from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


class WorkspaceTool:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def _path(self, relative: str) -> Path:
        candidate = (self.root / relative).resolve()
        if candidate != self.root and self.root not in candidate.parents:
            raise ValueError("workspace path escapes mission workspace")
        return candidate

    def read(self, path: str, *, max_bytes: int = 200_000) -> dict[str, Any]:
        target = self._path(path)
        data = target.read_bytes()
        if len(data) > max_bytes:
            raise ValueError("file exceeds bounded read size")
        return {
            "path": path,
            "content": data.decode("utf-8", "replace"),
            "sha256": __import__("hashlib").sha256(data).hexdigest(),
        }

    def write(self, path: str, content: str, *, overwrite: bool = True) -> dict[str, Any]:
        target = self._path(path)
        if not overwrite and target.exists():
            raise FileExistsError(path)
        data = content.encode("utf-8")
        if len(data) > 1_000_000:
            raise ValueError("file exceeds bounded write size")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return {
            "path": path,
            "bytes": len(data),
            "sha256": __import__("hashlib").sha256(data).hexdigest(),
        }

    def run(self, command: list[str], *, timeout_seconds: int = 120) -> dict[str, Any]:
        if not command or any(not isinstance(item, str) or not item for item in command):
            raise ValueError("command must be a non-empty argv list")
        timeout_seconds = min(max(timeout_seconds, 1), 300)
        completed = subprocess.run(
            command,
            cwd=self.root,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        return {
            "command": command,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-100_000:],
            "stderr": completed.stderr[-100_000:],
        }
