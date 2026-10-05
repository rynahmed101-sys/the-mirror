from mirror_lab.analysis import trajectory_summary
from mirror_lab.examples import run_demo
from mirror_lab.models import Experiment, Hypothesis, Model
from mirror_lab.operator import LabOperator
from mirror_lab.perturb import perturb_initial_state
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
