"""THE MIRROR exploratory mathematics and physics laboratory."""

from .builtin_tools import build_default_tool_registry
from .cycle import CognitiveCycle, CyclePhase, CycleResult
from .manifest import ExperimentManifest, ModelRef
from .models import Experiment, Hypothesis, Model, Observation, Result
from .operator import LabOperator
from .reasoning import ReasoningEngine
from .tooling import ToolContext, ToolRegistry, ToolResult, ToolSpec
from .registry import ModelRegistry
from .runner import run_experiment

__all__ = [
    "build_default_tool_registry",
    "CognitiveCycle",
    "CyclePhase",
    "CycleResult",
    "Experiment",
    "ExperimentManifest",
    "Hypothesis",
    "LabOperator",
    "Model",
    "ModelRef",
    "ModelRegistry",
    "Observation",
    "Result",
    "run_experiment",
    "ReasoningEngine",
    "ToolContext",
    "ToolRegistry",
    "ToolResult",
    "ToolSpec",
]
