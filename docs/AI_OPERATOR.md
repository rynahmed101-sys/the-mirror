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


## Frontier mode and work priority

The mature operator is not a passive experiment launcher. It is a frontier AI worker that can research public sources, inspect repository code, write bounded code, repair failed capability implementations, design experiments, and propose genuinely new mathematical or physical capabilities.

Its work queue is strictly prioritized:

1. repair a failed capability or requested correction;
2. current Automate backlog item;
3. the next capability required by the canonical ledger frontier;
4. explicit Automate verification/research requests;
5. discovery.

Discovery is deliberately last. If Automate needs Mirror to repair or implement something, the operator holds discovery work rather than competing with the canonical objective.

Automate supplies the current mission context, including capability ID, backlog, ledger frontier, request state, and ledger fingerprint. Mirror must not invent a duplicate capability when an existing capability ID is present.

### Capability creation

Mirror may discover and implement a candidate capability when discovery is the active priority. A candidate contains its proposed identity, scientific rationale, implementation changes, tests, provenance, and unresolved uncertainty. It is never written directly into Automate's canonical ledger or inventory.

Automate decides whether the candidate becomes a canonical capability.

### Capability repair

When a capability implementation fails verification, Mirror receives the failed implementation, changed paths, failed-job evidence, and diagnosis context. It may inspect the code, identify a root cause, modify the capability implementation, add regression tests, and produce a new repair proposal.

Quarantine is therefore only containment. The actual correction happens in Mirror's frontier operator.

### Tool authority

The frontier operator may use web/search, public scientific sources, repository inspection, local scientific engines, and bounded code-writing tools. These are instruments, not authorities.

Code changes must remain within the mission's declared workspace. Network access is explicit rather than implicit. Secrets and credentials are never treated as scientific evidence.

The operator may surprise us. It may produce a result that conflicts with established theory. That result is preserved and investigated. Automate independently decides whether any resulting code or claim can be promoted.


## Concrete frontier toolbelt

The frontier operator is backed by bounded instruments rather than prompt-only promises:

- research.search: OpenAlex, Crossref, INSPIRE-HEP, Semantic Scholar, arXiv, GitHub, Hugging Face.
- workspace.read / workspace.write: mission-workspace-only code inspection and modification.
- workspace.run: bounded local test/experiment execution.
- git.status / git.diff / git.branch / git.commit: isolated proposal preparation.
- experiment.run_manifest: execution through the existing scientific kernel.
- experiment.summarize: descriptive trajectory analysis.

Remote Git mutation and canonical Automate mutation are unavailable to the Mirror toolbelt.

## Research order

For capability work, research is reference-first:

1. canonical/established mathematics and physics where applicable;
2. mature scholarly literature and known methods;
3. independent open-source implementations;
4. primary literature and broader scholarly indexing;
5. frontier/preprint proposals;
6. genuinely novel hypotheses.

The first four are grounding and control instruments, not hidden acceptance tests. A novel result may disagree with an established theory and remain worth investigating. What changes is the evidence burden: surprising claims receive more reproduction, numerical-integrity, perturbation, and independent-route checks rather than automatic rejection.

A provider being reputable does not make every returned paper established physics. Research records distinguish trusted scholarly-source grounding from actual established/reference status.

## Frontier mission loop

Automate mission + ledger frontier
        |
        v
Chanfana durable frontier job
        |
        v
Mirror AI decision
        |
        +--> reference research / code inspection / experiment
        |
        v
bounded implementation or repair
        |
        v
tests + evidence + provenance
        |
        v
proposal result
        |
        v
Automate independent verification
        |
        v
promotion or rejection

Repair takes precedence over all other work. Discovery is disabled unless Automate explicitly grants it.


Development proposals targeting `engine` are subject to Mirror Engine CI before reconciliation; merged `main` remains the certification surface.
