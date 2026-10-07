"""Local open-weight AI runtime for THE MIRROR.

The model is a permanent operator, not a scientific certifier. All repository,
scientific, and maintenance actions remain observable and verifiable.
"""
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Any, Protocol

DEFAULT_MODEL_ID = "openai/gpt-oss-120b"

class ChatRuntime(Protocol):
    def generate(self, messages: list[dict[str, Any]], *, max_new_tokens: int = 2048) -> Any:
        ...

@dataclass(frozen=True)
class RuntimeConfig:
    model_id: str = DEFAULT_MODEL_ID
    revision: str | None = None
    max_new_tokens: int = 4096
    temperature: float = 0.7
    reasoning_effort: str = "high"
    device_map: str = "auto"

    @classmethod
    def from_env(cls) -> "RuntimeConfig":
        return cls(
            model_id=os.getenv("MIRROR_AI_MODEL", DEFAULT_MODEL_ID),
            revision=os.getenv("MIRROR_AI_MODEL_REVISION") or None,
            max_new_tokens=int(os.getenv("MIRROR_AI_MAX_NEW_TOKENS", "4096")),
            temperature=float(os.getenv("MIRROR_AI_TEMPERATURE", "0.7")),
            reasoning_effort=os.getenv("MIRROR_AI_REASONING_EFFORT", "high"),
            device_map=os.getenv("MIRROR_AI_DEVICE_MAP", "auto"),
        )

class TransformersRuntime:
    """Actual local inference runtime backed by Hugging Face Transformers."""
    def __init__(self, config: RuntimeConfig | None = None) -> None:
        self.config = config or RuntimeConfig.from_env()
        self._pipeline: Any | None = None

    @property
    def loaded(self) -> bool:
        return self._pipeline is not None

    def load(self) -> None:
        if self._pipeline is not None:
            return
        try:
            from transformers import pipeline
        except ImportError as exc:
            raise RuntimeError(
                "Mirror AI runtime requires transformers. Install the ai extra."
            ) from exc
        kwargs: dict[str, Any] = {
            "model": self.config.model_id,
            "torch_dtype": "auto",
            "device_map": self.config.device_map,
        }
        if self.config.revision:
            kwargs["revision"] = self.config.revision
        self._pipeline = pipeline("text-generation", **kwargs)

    def generate(
        self,
        messages: list[dict[str, Any]],
        *,
        max_new_tokens: int | None = None,
    ) -> Any:
        self.load()
        assert self._pipeline is not None
        return self._pipeline(
            messages,
            max_new_tokens=max_new_tokens or self.config.max_new_tokens,
            temperature=self.config.temperature,
        )

def default_runtime() -> TransformersRuntime:
    return TransformersRuntime()
