from .models import Experiment, Hypothesis, Model
from .runner import run_experiment

def run_demo():
    """A deliberately simple recurrence used to prove the lab observes behavior."""
    def step(state, _dt, params):
        return state + params["gain"] * (params["offset"] - state)

    hypothesis = Hypothesis(
        id="demo-relational-rule",
        statement="Repeated application of a relational rule may produce a stable state.",
        assumptions=("The rule is applied repeatedly.",),
        expected_behavior="Unknown until executed.",
    )
    model = Model(
        id="scalar-relational-rule",
        version="0.1",
        step=step,
        description="Minimal deterministic state transition.",
    )
    experiment = Experiment(
        id="demo-relational-run",
        hypothesis=hypothesis,
        model=model,
        initial_state=0.0,
        parameters={"gain": 0.35, "offset": 10.0},
        steps=20,
    )
    return run_experiment(experiment)
