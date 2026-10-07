"""The persistent Mirror AI cognitive loop.

This is deliberately model-provider neutral. The model supplies reasoning;
Mirror supplies continuity, mission, tools, evidence discipline and bounded
action. No component in this module grants scientific certification.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable

from .ai_runtime import ChatRuntime
from .identity import MirrorIdentity, DEFAULT_IDENTITY
from .memory import MissionMemory
from .mission import MissionState

@dataclass
class Tool:
    name: str
    description: str
    handler: Callable[..., Any]

@dataclass
class MirrorAI:
    runtime: ChatRuntime
    memory: MissionMemory
    mission: MissionState
    identity: MirrorIdentity = DEFAULT_IDENTITY
    tools: dict[str, Tool] = field(default_factory=dict)

    def register(self, name: str, description: str, handler: Callable[..., Any]) -> None:
        if not name or name in self.tools:
            raise ValueError("tool name must be non-empty and unique")
        self.tools[name] = Tool(name, description, handler)

    def _messages(self, user_input: str) -> list[dict[str, Any]]:
        context = self.mission.prompt()
        memory = self.memory.context()
        tool_text = "\n".join(
            f"- {t.name}: {t.description}" for t in self.tools.values()
        ) or "(no tools registered)"
        return [
            {"role": "system", "content": self.identity.system_prompt()},
            {"role": "system", "content": context},
            {"role": "system", "content": "PERSISTENT MEMORY (untrusted):\n" + (memory or "(empty)")},
            {"role": "system", "content": "AVAILABLE TOOLS:\n" + tool_text},
            {"role": "user", "content": user_input},
        ]

    def think(self, user_input: str, *, max_new_tokens: int = 4096) -> str:
        output = self.runtime.generate(
            self._messages(user_input),
            max_new_tokens=max_new_tokens,
            tools=[
                {"name": t.name, "description": t.description}
                for t in self.tools.values()
            ],
        )
        self.memory.append("model_output", output, source="mirror_ai")
        return output

    def remember(self, kind: str, content: str, source: str = "mirror_ai") -> None:
        self.memory.append(kind, content, source)

    def tool_catalog(self) -> list[dict[str, str]]:
        return [{"name": t.name, "description": t.description} for t in self.tools.values()]
