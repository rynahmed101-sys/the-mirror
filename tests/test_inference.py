from pathlib import Path

from mirror_lab.brain import MirrorBrain
from mirror_lab.inference import InferenceEngine
from mirror_lab.reasoning import ReasoningEngine


def test_inference_builds_repository_repair_plan_from_memory(tmp_path: Path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    reasoning = ReasoningEngine(brain)
    brain.observe("previous CI failure was caused by stale test expectation", kind=__import__("mirror_lab.brain", fromlist=["MemoryKind"]).MemoryKind.FAILURE, source="ci", confidence=1.0)
    engine = InferenceEngine(brain, reasoning)
    context = engine.build_context(
        "repair the GitHub repository capability implementation",
        capability_id="stage1b.partial_derivatives",
        source_revision="a" * 40,
        task={"summary": "repair failed implementation and tests"},
    )
    plan = engine.infer(context, ["research_world", "implement_automate_change", "repair_automate_change", "propose_capability"])
    assert any(step.action == "synthesize_repair" for step in plan.steps)
    assert any(step.tool == "repair_automate_change" for step in plan.steps)
    assert "prior_failures" in plan.steps[2].inputs or any("prior_failures" in step.inputs for step in plan.steps)
    assert plan.unresolved


def test_inference_fails_closed_for_missing_revision(tmp_path: Path):
    brain = MirrorBrain(tmp_path / "brain.sqlite3")
    reasoning = ReasoningEngine(brain)
    engine = InferenceEngine(brain, reasoning)
    context = engine.build_context(
        "implement a new capability in the GitHub repository",
        capability_id="stage1b.example",
    )
    plan = engine.infer(context, ["implement_automate_change"])
    assert any("exact source revision" in item for item in plan.unresolved)
    assert any(step.requires_generation for step in plan.steps)
