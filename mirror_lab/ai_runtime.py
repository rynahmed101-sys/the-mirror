"""Local open-weight AI runtime for THE MIRROR."""
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Any, Protocol

DEFAULT_MODEL_ID = "Qwen/Qwen3-30B-A3B-Instruct-2507"

class ChatRuntime(Protocol):
    def generate(self, messages: list[dict[str, Any]], *, max_new_tokens: int = 2048, tools: list[Any] | None = None) -> Any:
        ...

@dataclass(frozen=True)
class RuntimeConfig:
    model_id: str = DEFAULT_MODEL_ID
    revision: str | None = None
    max_new_tokens: int = 4096
    temperature: float = 0.7
    device_map: str = "auto"

    @classmethod
    def from_env(cls) -> "RuntimeConfig":
        return cls(
            model_id=os.getenv("MIRROR_AI_MODEL", DEFAULT_MODEL_ID),
            revision=os.getenv("MIRROR_AI_MODEL_REVISION") or None,
            max_new_tokens=int(os.getenv("MIRROR_AI_MAX_NEW_TOKENS", "4096")),
            temperature=float(os.getenv("MIRROR_AI_TEMPERATURE", "0.7")),
            device_map=os.getenv("MIRROR_AI_DEVICE_MAP", "auto"),
        )

class TransformersRuntime:
    """Actual local inference runtime backed by Hugging Face Transformers."""

    def __init__(self, config: RuntimeConfig | None = None) -> None:
        self.config = config or RuntimeConfig.from_env()
        self._model: Any | None = None
        self._tokenizer: Any | None = None

    @property
    def loaded(self) -> bool:
        return self._model is not None and self._tokenizer is not None

    def load(self) -> None:
        if self.loaded:
            return
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as exc:
            raise RuntimeError(
                "Mirror AI runtime requires transformers. Install the ai extra."
            ) from exc

        kwargs: dict[str, Any] = {"device_map": self.config.device_map, "torch_dtype": "auto"}
        if self.config.revision:
            kwargs["revision"] = self.config.revision
        self._tokenizer = AutoTokenizer.from_pretrained(
            self.config.model_id, revision=self.config.revision
        )
        self._model = AutoModelForCausalLM.from_pretrained(
            self.config.model_id, **kwargs
        )

    def generate(
        self,
        messages: list[dict[str, Any]],
        *,
        max_new_tokens: int | None = None,
        tools: list[Any] | None = None,
    ) -> str:
        self.load()
        assert self._model is not None and self._tokenizer is not None
        template_kwargs: dict[str, Any] = {
            "add_generation_prompt": True,
            "tokenize": True,
            "return_dict": True,
            "return_tensors": "pt",
        }
        if tools:
            template_kwargs["tools"] = tools
        inputs = self._tokenizer.apply_chat_template(messages, **template_kwargs)
        inputs = inputs.to(self._model.device)
        outputs = self._model.generate(
            **inputs,
            max_new_tokens=max_new_tokens or self.config.max_new_tokens,
            temperature=self.config.temperature,
            do_sample=self.config.temperature > 0,
        )
        prompt_len = inputs["input_ids"].shape[-1]
        return self._tokenizer.decode(outputs[0][prompt_len:], skip_special_tokens=False)

def default_runtime() -> TransformersRuntime:
    return TransformersRuntime()
