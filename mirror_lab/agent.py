"""Provider-neutral bounded AI tool runtime for THE MIRROR."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from .operator import FrontierOperator, MissionContext


class Tool(Protocol):
    name: str
    description: str

    def invoke(self, arguments: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass
class ToolRegistry:
    tools: dict[str, Tool]

    def invoke(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        tool = self.tools.get(name)
        if tool is None:
            raise ValueError(f"Unknown tool: {name}")
        return tool.invoke(arguments)


@dataclass
class AgentStep:
    action: str
    tool: str | None
    arguments: dict[str, Any]
    result: dict[str, Any] | None = None


class FrontierAgent:
    """Turns FrontierOperator decisions into bounded tool executions.

    The model remains replaceable. The runtime enforces tool names, mission priority,
    step limits, and a final evidence handoff. It does not grant scientific authority.
    """

    def __init__(self, operator: FrontierOperator, tools: ToolRegistry, *, max_steps: int = 8) -> None:
        self.operator = operator
        self.tools = tools
        self.max_steps = max(1, min(max_steps, 32))

    def run(self, mission: MissionContext, context: dict[str, Any]) -> dict[str, Any]:
        history: list[AgentStep] = []
        current = dict(context)
        current["available_tools"] = [
            {"name": name, "description": tool.description} for name, tool in self.tools.tools.items()
        ]
        for _ in range(self.max_steps):
            decision = self.operator.decide(mission, {**current, "history": [h.__dict__ for h in history]})
            action = str(decision.get("action", "defer"))
            if action in {"defer", "research", "experiment", "implement", "repair", "create_capability_candidate"}:
                tool_name = decision.get("tool")
                if not tool_name:
                    return {
                        "status": "decision_only",
                        "action": action,
                        "decision": decision,
                        "steps": [h.__dict__ for h in history],
                    }
                result = self.tools.invoke(str(tool_name), dict(decision.get("arguments") or {}))
                history.append(AgentStep(action=action, tool=str(tool_name), arguments=dict(decision.get("arguments") or {}), result=result))
                current["last_tool_result"] = result
                if decision.get("complete", False):
                    break
                continue
            raise ValueError(f"Unsupported action: {action}")
        return {
            "status": "completed",
            "steps": [h.__dict__ for h in history],
            "final_context": current,
        }
