"""THE MIRROR exploratory mathematics and physics laboratory."""

from .manifest import ExperimentManifest, ModelRef
from .models import Experiment, Hypothesis, Model, Observation, Result
from .operator import LabOperator
from .registry import ModelRegistry
from .runner import run_experiment

__all__ = [
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
]
