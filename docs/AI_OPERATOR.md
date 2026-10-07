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


## External researcher mode

THE MIRROR also supports a distinct **external researcher** role. This role is intentionally broader than the Automate implementation worker: it is allowed to acquire public research material and investigate the open world through bounded provider adapters.

The external researcher may:
- search scholarly metadata through Crossref and OpenAlex;
- search arXiv records;
- inspect public GitHub repositories;
- inspect public Hugging Face model metadata;
- compare independent sources;
- preserve contradictory or incomplete findings;
- propose experiments based on external evidence.

External research output is always tagged as **UNTRUSTED_EXTERNAL_EVIDENCE**. A source result is an observation about what a provider returned, not proof of the provider's claims.

The external researcher must preserve:
- query;
- provider;
- source identifier;
- source URL;
- retrieval timestamp;
- revision/version where available;
- content or metadata fingerprint where available;
- limitations;
- correlation/request identity.

The researcher does not receive authority to alter Automate's ledger, capability inventory, rule registry, or certification state.

The world-facing boundary is deliberately provider-neutral. Adding a new provider must not require changing the scientific evidence model.

This is the laboratory's "look outward" capability. It is not the laboratory's "believe what you found" capability.


## Permanent AI runtime

THE MIRROR has a canonical open-weight AI identity. The selected model is **OpenAI gpt-oss-120b** from Hugging Face.

Model identity:
- model: openai/gpt-oss-120b
- license: Apache-2.0
- native context: 131,072 tokens
- runtime: Hugging Face Transformers
- deployment target: self-hosted GPU inference
- operational role: permanent Mirror operator, maintainer, scientist, and controller
- scientific authority: none; generated claims and proposed changes remain verification inputs

The choice is deliberate. The model is open-weight, self-hostable, supports configurable reasoning, function calling, structured outputs, and agentic workflows. Its MXFP4 deployment target is a single 80 GB GPU-class machine. There is no hosted-provider token quota in the local deployment path. Physical limits still exist: context length, GPU memory, throughput, and generation limits are engineering constraints, not API subscription limits.

The runtime is lazy-loaded so the scientific kernel can still run without GPU dependencies. Installing the ai extra installs Transformers, PyTorch, Accelerate, and the required kernel support.

The permanent AI is not a replacement for verification. It is the actor that proposes, investigates, repairs, maintains, and controls execution. Verification remains an external boundary precisely because a capable agent must not be allowed to certify its own claims.

The intended loop is:

PERMANENT MIRROR AI
  - maintenance
  - diagnosis
  - repair
  - scientific investigation
  - experiment design/execution
  - external research
  - system control
          |
          v
evidence / code / experiment artifacts
          |
          v
AUTOMATE verification
          |
          v
promotion or rejection
          |
          v
feedback to MIRROR AI

The model revision must be pinned before production certification. A moving model alias is not acceptable evidence.

The first real execution test is intentionally separate from unit tests: it must load the selected checkpoint, generate a response, exercise a tool call, execute a bounded tool, and feed the tool result back into the model. A green Python test suite alone is not an AI runtime test.
