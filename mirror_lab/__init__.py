"""THE MIRROR exploratory mathematics and physics laboratory."""

from .cycle import CognitiveCycle, CyclePhase, CycleResult
from .manifest import ExperimentManifest, ModelRef
from .models import Experiment, Hypothesis, Model, Observation, Result
from .operator import LabOperator
from .reasoning import ReasoningEngine
from .tooling import ToolContext, ToolRegistry, ToolResult, ToolSpec
from .registry import ModelRegistry
from .runner import run_experiment

__all__ = [
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
