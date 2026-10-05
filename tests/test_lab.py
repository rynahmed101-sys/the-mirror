from pathlib import Path

from mirror_lab.analysis import trajectory_summary
from mirror_lab.examples import demo_model, run_demo
from mirror_lab.manifest import ExperimentManifest
from mirror_lab.models import Experiment, Hypothesis, Model
from mirror_lab.operator import LabOperator
from mirror_lab.perturb import perturb_initial_state
from mirror_lab.registry import ModelRegistry
from mirror_lab.runner import run_experiment


def test_experiment_runs_without_expected_physics():
    result = run_demo()
    assert result.status == "completed"
    assert result.observations
    assert 9.0 < result.final_state < 10.0


def test_observation_is_preserved():
    model = Model("doubling", "1", lambda state, dt, params: state * 2)
    experiment = Experiment("doubling-run", Hypothesis("h1", "Repeated doubling."), model, 1, steps=4)
    result = run_experiment(experiment)
    assert [o.state for o in result.observations] == [1, 2, 4, 8, 16]


def test_perturbation_changes_only_initial_state():
    model = Model("increment", "1", lambda state, dt, params: state + 1)
    experiment = Experiment("perturbation", Hypothesis("h2", "Initial conditions matter."), model, 1, steps=2)
    result = perturb_initial_state(experiment, lambda x: x + 0.5)
    assert result.observations[0].state == 1.5
    assert result.observations[-1].state == 3.5


def test_analysis_does_not_assign_a_physics_verdict():
    summary = trajectory_summary([1, 2, 4, 8])
    assert summary["monotonic_non_decreasing"] is True
    assert "physical" not in summary


def test_ai_operator_runs_without_being_a_verdict_engine():
    model = Model("increment", "1", lambda state, dt, params: state + 1)
    experiment = Experiment(
        "operator-run",
        Hypothesis("h3", "A simple recurrence."),
        model,
        0,
        steps=3,
    )
    result = LabOperator().run(experiment, record=False)
    assert result.status == "completed"
    assert [o.state for o in result.observations] == [0, 1, 2, 3]


def test_ai_operator_summarizes_observations():
    summary = LabOperator.summarize([1, 2, 3])
    assert summary["finite"] is True
    assert summary["range"] == 2


def test_manifest_is_declarative_and_hashable(tmp_path: Path):
    manifest_path = tmp_path / "experiment.json"
    manifest_path.write_text(
        Path("examples/first_experiment.json").read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    manifest = ExperimentManifest.load(manifest_path)
    assert manifest.model.id == "scalar-relational-rule"
    assert len(manifest.content_hash) == 64
    assert "step" not in manifest.to_dict()


def test_operator_executes_manifest_through_registry(tmp_path: Path):
    manifest = ExperimentManifest.load("examples/first_experiment.json")
    registry = ModelRegistry()
    registry.register(demo_model())
    result = LabOperator(registry=registry).run_manifest(manifest, record=False)
    assert result.status == "completed"
    assert result.experiment_id == manifest.id
    assert result.observations[-1].state > 9.0
