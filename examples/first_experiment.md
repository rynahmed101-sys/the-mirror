# First Mirror Experiment

This example intentionally has no established physical target.

Hypothesis: repeated application of a simple relational rule may produce a stable state.

The laboratory executes the rule, records the trajectory, and reports what occurred. It does not decide in advance what the result is supposed to be.

## Human/AI workflow

The AI operator can work from the declarative JSON manifest:

    examples/first_experiment.json

The manifest contains the hypothesis, model reference, initial state, parameters, execution horizon, and metadata. It contains **no executable code**.

The executable model is resolved separately through the model registry. This keeps machine-generated experiment descriptions separate from executable instruments.

## Run locally

    python -m pip install -e '.[dev]'
    mirror demo
    mirror run-manifest examples/first_experiment.json
    pytest

The manifest is content-hashed when bound to an executable model. The hash is carried into the experiment metadata and therefore into the evidence record.
