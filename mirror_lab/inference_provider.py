"""Local, quota-free model provider boundary.

The provider is deliberately optional. Mirror can execute deterministic inference
without it, but when a local GGUF model is installed it becomes the generator
for bounded patch/repair proposals. No hosted inference API is required.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import os
import subprocess
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class GenerationRequest:
    system: str
    prompt: str
    max_tokens: int = 1536
    temperature: float = 0.1


class LocalModelProvider:
    """Run a local llama.cpp-compatible executable against a local GGUF model."""

    def __init__(
        self,
        model_path: str | Path | None = None,
        runner: str | Path | None = None,
    ) -> None:
        self.model_path = Path(model_path or os.getenv("MIRROR_MODEL_PATH", "")).expanduser()
        self.runner = Path(runner or os.getenv("MIRROR_MODEL_RUNNER", "llama-cli"))

    @property
    def available(self) -> bool:
        return self.model_path.is_file() and bool(self.runner)

    def generate(self, request: GenerationRequest, *, timeout_seconds: int = 180) -> str:
        if not self.model_path.is_file():
            raise RuntimeError("no local GGUF model configured")
        if request.max_tokens < 1 or request.max_tokens > 4096:
            raise ValueError("max_tokens outside bounded range")
        prompt = f"<|system|>\n{request.system}\n<|user|>\n{request.prompt}\n<|assistant|>\n"
        proc = subprocess.run(
            [
                str(self.runner), "-m", str(self.model_path),
                "-p", prompt,
                "-n", str(request.max_tokens),
                "--temp", str(request.temperature),
                "--no-display-prompt",
            ],
            capture_output=True, text=True, timeout=min(max(timeout_seconds, 1), 300),
            check=False,
        )
        if proc.returncode:
            raise RuntimeError(proc.stderr[-4000:] or "local model failed")
        return proc.stdout[-100_000:]

    def generate_json(self, request: GenerationRequest, *, timeout_seconds: int = 180) -> dict[str, Any]:
        raw = self.generate(request, timeout_seconds=timeout_seconds)
        start, end = raw.find("{"), raw.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("model did not return a JSON object")
        value = json.loads(raw[start:end + 1])
        if not isinstance(value, dict):
            raise ValueError("model JSON output must be an object")
        return value
