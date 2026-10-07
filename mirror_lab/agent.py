"""Permanent AI controller for THE MIRROR."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Protocol
from .ai_runtime import ChatRuntime

class Tool(Protocol):
    name: str
    def __call__(self, arguments: Mapping[str, Any]) -> Any:
        ...

@dataclass
class PermanentAgent:
    runtime: ChatRuntime
    tools: dict[str, Callable[[Mapping[str, Any]], Any]] = field(default_factory=dict)
    system_prompt: str = (
        "You are the permanent AI operator of THE MIRROR. "
        "You are responsible for maintenance, scientific investigation, "
        "controller/orchestration decisions, diagnosis, repair proposals, "
        "research, experiments, and capability development. "
        "You may investigate unconventional mathematics and physics. "
        "Inspect evidence, preserve uncertainty, and distinguish observation "
        "from hypothesis. Never certify your own work. Every consequential "
        "change must leave a reproducible artifact and pass external verification. "
        "Prefer repairing current work over unrelated discovery."
    )

    def register_tool(self, name: str, tool: Callable[[Mapping[str, Any]], Any]) -> None:
        if not name or name in self.tools:
            raise ValueError("tool name must be non-empty and unique")
        self.tools[name] = tool

    def ask(self, user_input: str, *, max_new_tokens: int = 4096) -> Any:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_input},
        ]
        return self.runtime.generate(messages, max_new_tokens=max_new_tokens)

    def tool_catalog(self) -> list[dict[str, str]]:
        return [
            {"name": name, "description": getattr(tool, "__doc__", "") or ""}
            for name, tool in sorted(self.tools.items())
        ]
