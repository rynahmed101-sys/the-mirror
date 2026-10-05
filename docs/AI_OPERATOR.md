# AI Operator Architecture

## Purpose

THE MIRROR is designed to be operated by AI rather than by a human manually performing technical simulation work.

The user can say what they want to investigate. The AI should be able to turn that request into a sequence of concrete scientific operations without requiring the user to manipulate equations, solver settings, files, databases, or dashboards by hand.

This is analogous to a scientist using an instrument: the scientist asks a question; the instrument performs the technical procedure and returns observations.

## Important distinction

**AI-operated does not mean AI-decided truth.**

The AI operates the machinery. It does not become the authority for whether a hypothesis is true.

The laboratory records:

- what was proposed;
- what was formalized;
- what was executed;
- what inputs were used;
- what happened;
- how numerically reliable the result appears;
- what patterns were detected;
- what comparisons were made;
- what remains unexplained.

Interpretation and conjecture must remain distinguishable from raw observation.

## Primary operator capabilities

The operator should eventually have first-class operations for:

- define_hypothesis
- formalize_model
- design_experiment
- run_experiment
- repeat_experiment
- perturb_initial_conditions
- sweep_parameters
- change_solver
- change_precision
- change_resolution
- analyze_trajectory
- detect_structure
- compare_runs
- compare_models
- compare_reference
- record_evidence
- inspect_provenance
- propose_next_experiment

These are orchestration capabilities, not scientific verdicts.

## Current operator boundary

The first Python implementation exposes a programmatic LabOperator facade over the scientific kernel.

The facade exists so future AI/plugin integrations can operate the lab through a stable interface instead of reaching into implementation details.

The operator should remain thin. Scientific algorithms belong in the relevant engine/analysis modules.

## Conversation-to-experiment translation

A natural-language request should become an explicit experiment record before execution.

For example:

~~~text
User:
"What happens if this relation is iterated from these initial values?"

AI:
1. identify the proposed relation;
2. state assumptions;
3. construct the model;
4. choose initial state and parameters;
5. choose a finite execution horizon;
6. execute;
7. preserve the complete trajectory;
8. analyze basic structure;
9. perturb relevant inputs;
10. determine which observations survive;
11. record the evidence;
12. propose the next useful experiment.
~~~

The AI should not skip directly from a prompt to a conclusion.

## Discovery behavior

When an experiment produces an unexpected result, the default response is:

~~~text
unexpected result
      ↓
check implementation
      ↓
check numerical integrity
      ↓
repeat
      ↓
perturb
      ↓
characterize
      ↓
compare if useful
      ↓
preserve if still present
~~~

Not:

~~~text
unexpected result → discard
~~~

## Human role

Humans remain important, but they should not be forced to perform repetitive technical operations.

Humans provide:

- research direction;
- ideas and hypotheses;
- conceptual constraints;
- authorization for consequential actions;
- judgment about what questions are worth pursuing.

The AI performs the mechanical and computational research loop.

## Provider independence

The operator interface must not assume a specific AI provider.

The following are replaceable adapters:

- ChatGPT/plugin integration;
- GitHub agent integration;
- local model integration;
- future external agent;
- future multi-agent orchestration.

The Python scientific core remains the stable center.

## Long-term direction

The mature Mirror should feel like an AI scientist's laboratory:

~~~text
question
  → experiment
  → observation
  → follow-up experiment
  → deeper experiment
  → evidence graph
  → new question
~~~

The objective is not autonomous storytelling.

The objective is **autonomous experimental iteration grounded in recorded computation**.
