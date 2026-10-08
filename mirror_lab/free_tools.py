"""Optional adapters for useful free/open AI tooling.

Adapters are optional capability probes, not authority. Results remain
UNTRUSTED_MIRROR_PROPOSAL until isolated tests and Automate verification pass.
No model download or custom service is required.
"""
from __future__ import annotations
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


class FreeToolbelt:
    def __init__(self, workspace: str | Path) -> None:
        self.workspace = Path(workspace).resolve()

    @staticmethod
    def _which(name: str) -> str | None:
        return shutil.which(name)

    def available(self) -> dict[str, bool]:
        return {
            "agent_reach": self._which("agent-reach") is not None,
            "opencode": self._which("opencode") is not None,
            "goose": self._which("goose") is not None,
            "aider": self._which("aider") is not None,
        }

    def agent_reach_doctor(self) -> dict[str, Any]:
        exe = self._which("agent-reach")
        if not exe:
            return {"status": "UNAVAILABLE", "tool": "agent-reach"}
        return self._run([exe, "doctor", "--json"], self.workspace, 60)

    @staticmethod
    def _checked_sha(value: Any) -> str:
        sha = str(value or "")
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            raise ValueError("revision must be an exact 40-character Git SHA")
        return sha

    def opencode_proposal(self, *, revision: str, objective: str, prompt: str = "") -> dict[str, Any]:
        exe = self._which("opencode")
        if not exe:
            return {"status": "UNAVAILABLE", "tool": "opencode"}
        revision = self._checked_sha(revision)
        objective = objective.strip()
        if not objective or len(objective) > 8000 or len(prompt) > 12000:
            raise ValueError("bounded coding-agent request is invalid")
        root = Path(tempfile.mkdtemp(prefix="mirror-free-agent-"))
        try:
            steps = (
                ["git", "init"],
                ["git", "remote", "add", "origin", "https://github.com/rynahmed101-sys/automate.git"],
                ["git", "fetch", "--depth", "1", "origin", revision],
                ["git", "checkout", "--detach", revision],
            )
            for args in steps:
                result = self._run(args, root, 120)
                if result["returncode"] != 0:
                    return {"status": "CHECKOUT_FAILED", "revision": revision, "step": result}
            mission = (
                "You are a bounded coding specialist. Work only inside this checkout. "
                "Implement the requested change and add focused regression tests. "
                "Do not change CI authority, security policy, ledger authority, or merge anything. "
                "Leave changes in the working tree for inspection.\n\n"
                f"Objective: {objective}\n"
                f"Constraints: {prompt or 'Use the existing architecture and exact base revision.'}"
            )
            result = self._run([exe, "run", "--auto", "--format", "json", mission], root, 240)
            diff = self._run(["git", "diff", "--binary", "--no-ext-diff"], root, 30)
            status = "PROPOSAL_READY" if result["returncode"] == 0 and diff["stdout"] else "NO_DIFF"
            return {
                "status": status if result["returncode"] == 0 else "AGENT_FAILED",
                "authority": "UNTRUSTED_MIRROR_PROPOSAL",
                "provider": "opencode",
                "revision": revision,
                "agent": result,
                "diff": diff["stdout"][:1_900_000],
            }
        finally:
            shutil.rmtree(root, ignore_errors=True)

    @staticmethod
    def _run(args: list[str], cwd: Path, timeout: int) -> dict[str, Any]:
        try:
            completed = subprocess.run(
                args, cwd=cwd, env=os.environ.copy(),
                capture_output=True, text=True, timeout=min(max(timeout, 1), 300), check=False,
            )
        except subprocess.TimeoutExpired as exc:
            return {"command": args, "returncode": 124, "stdout": str(exc.stdout or "")[-12000:], "stderr": "bounded timeout expired"}
        return {
            "command": args,
            "returncode": completed.returncode,
            "stdout": completed.stdout[-12000:],
            "stderr": completed.stderr[-8000:],
        }
