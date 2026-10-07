"""Permanent AI controller for THE MIRROR."""
from __future__ import annotations
import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping
from .ai_runtime import ChatRuntime

_TOOL_CALL = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)

@dataclass
class PermanentAgent:
    runtime: ChatRuntime
    tools: dict[str, Callable[..., Any]] = field(default_factory=dict)
    system_prompt: str = (
        "You are the permanent AI operator of THE MIRROR. "
        "You maintain the system, diagnose failures, repair code, conduct "
        "scientific investigations, design and execute experiments, research "
        "public evidence, and control bounded operations. You may investigate "
        "unconventional mathematics and physics. Preserve uncertainty. "
        "Never certify your own work. Every consequential change must leave "
        "reproducible evidence and pass the external verification boundary. "
        "Prefer repairing current work over unrelated discovery."
    )

    def register_tool(self, name: str, tool: Callable[..., Any]) -> None:
        if not name or name in self.tools:
            raise ValueError("tool name must be non-empty and unique")
        self.tools[name] = tool

    def ask(self, user_input: str, *, max_new_tokens: int = 4096) -> str:
        messages = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_input},
        ]
        return self.runtime.generate(
            messages, max_new_tokens=max_new_tokens, tools=list(self.tools.values())
        )

    def run(
        self,
        user_input: str,
        *,
        max_steps: int = 8,
        max_new_tokens: int = 4096,
    ) -> str:
        """Run a bounded model/tool loop. The loop itself never certifies results."""
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": user_input},
        ]
        for _ in range(max_steps):
            output = self.runtime.generate(
                messages,
                max_new_tokens=max_new_tokens,
                tools=list(self.tools.values()),
            )
            match = _TOOL_CALL.search(output)
            if not match:
                return output
            payload = json.loads(match.group(1))
            name = payload["name"]
            arguments = payload.get("arguments", {})
            if name not in self.tools:
                raise RuntimeError(f"Model requested unknown tool: {name}")
            messages.append({
                "role": "assistant",
                "tool_calls": [{
                    "type": "function",
                    "function": {"name": name, "arguments": arguments},
                }],
            })
            result = self.tools[name](**arguments)
            messages.append({"role": "tool", "content": str(result)})
        raise RuntimeError("Mirror AI tool loop exceeded max_steps")

    def tool_catalog(self) -> list[dict[str, str]]:
        return [
            {"name": name, "description": getattr(tool, "__doc__", "") or ""}
            for name, tool in sorted(self.tools.items())
        ]
