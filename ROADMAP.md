# THE MIRROR — RESEARCH & ENGINEERING ROADMAP

Status: **IMPLEMENTATION ACTIVE — local scientific kernel established.**

This roadmap is persistent engineering/scientific memory for future work on this repository.

## North-star objective
Build a reusable laboratory in which a mathematical or physical hypothesis can be formalized, executed, simulated, observed, perturbed, compared, reproduced, and investigated WITHOUT requiring the result to agree with established physics.

The lab must be capable of discovering agreement, disagreement, limiting-case agreement, regime changes, stability, instability, oscillation, divergence, convergence, emergent structure, invariants, asymmetry, unexpected correlations, or unresolved behavior.

## Operating model — AI is the laboratory operator
THE MIRROR is not designed around a human manually operating technical machinery.

The intended workflow is:

~~~text
human gives question / idea / constraint
                |
                v
        AI operator
                |
                +--> formalize hypothesis
                |
                +--> construct model
                |
                +--> design experiment
                |
                +--> execute local engine
                |
                +--> perturb / repeat / sweep
                |
                +--> analyze observations
                |
                +--> compare when useful
                |
                +--> record evidence
                |
                +--> propose next experiment
                |
                v
          human reviews direction
~~~

The AI is allowed to perform the repetitive technical work. It is not allowed to replace computation with generated explanation.

The AI provider is replaceable. The scientific core remains local and provider-independent.

## Phase 0 — Architectural reset
- [x] Write the laboratory constitution.
- [x] Reject convergence toward established physics as the primary objective.
- [x] Separate exploratory experiments from canonical calculation.
- [x] Define reference theories as optional comparison instruments.
- [x] Define UNKNOWN/UNRESOLVED as valid outcomes.
- [x] Research mature open-source simulation and analysis infrastructure.
- [x] Remove hosted database configuration from the active project.
- [x] Remove the Node/Drizzle toolchain from the active build path.
- [x] Replace hosted/Node CI with local scientific Python CI.
- [x] Pause the linked Vercel project so Git changes no longer deploy as active builds.
- [x] Establish local SQLite as the first evidence ledger.
- [x] Define AI as the primary laboratory operator.
- [x] Add an AI-facing operator contract and Python facade.
- [ ] Remove the remaining legacy web source tree.
- [x] Preserve Git history rather than rewriting history destructively.

## Phase 1 — Scientific kernel
The active implementation is Python-first and currently begins with:
~~~text
mirror_lab/
  models.py
  runner.py
  analysis.py
  perturb.py
  ledger.py
  operator.py
  manifest.py
  registry.py
  examples.py
  cli.py
~~~

Implemented:
- [x] Hypothesis object.
- [x] Executable Model object.
- [x] Experiment object.
- [x] Observation object.
- [x] Result object.
- [x] Deterministic local execution.
- [x] Controlled initial-state perturbation.
- [x] Descriptive trajectory analysis.
- [x] Local SQLite evidence ledger with content hashes.
- [x] AI-facing orchestration facade.
- [x] CLI demo.
- [x] First executable experiment.
- [x] Python tests.

Next:
- [ ] Separate model/state/engine interfaces more cleanly.
- [ ] Add explicit provenance/environment capture.
- [ ] Add standardized experiment manifests.
- [ ] Add artifact storage.
- [ ] Add structured execution diagnostics.
- [ ] Add reproducible random-seed handling without global RNG state.
- [x] Add machine-readable experiment manifests and operator execution path for plugin integration.
- [ ] Add richer machine-readable operator commands/results for plugin integration.

## Phase 2 — Simulation engine layer
Do NOT build one giant simulator. Build an adapter contract so specialized engines can execute the same experimental lifecycle.

2A: deterministic discrete systems — **in progress / first engine present** for relational laws, recurrence, state machines, and custom rules.

2B: ODE/dynamical systems — use mature numerical solvers; support trajectories, fixed points, oscillation, stability, and parameter sweeps.

2C: PDE/field systems — introduce only when a real experiment requires them; evaluate mature tools rather than reinventing them.

2D: stochastic/Monte Carlo — repeated trials, stochastic trajectories, distributions, and uncertainty.

2E: agent/interaction systems — local rules producing system-level behavior.

2F: graph/network dynamics — relational and topological hypotheses.

2G: symbolic systems — symbolic manipulation and equation formulation.

2H: differentiable/high-performance computation — optional JAX path for autodiff, vectorization, JIT, and accelerators.

## Phase 3 — Experimental exploration
Build parameter exploration, sensitivity analysis, perturbation experiments, and property-based exploration.

Parameter exploration: one-dimensional sweeps, multidimensional grids, random sampling, Latin hypercube sampling, then adaptive exploration if justified.

Sensitivity analysis: prefer SALib over reinventing established methods.

Perturbation experiments: vary initial conditions, parameters, precision, timestep, solver, boundary conditions, noise, and model components.

Property-based exploration: use Hypothesis-style testing for declared computational properties and edge-case discovery. Do not turn properties into hidden assumptions about the scientific result.

## Phase 4 — Observation and discovery engine
Initial detectors: convergence/divergence, oscillation, periodicity, fixed points, recurrence, monotonicity, extrema, discontinuities, symmetry/asymmetry, invariant quantities, scaling relations, sensitivity, bifurcation candidates, regime changes, clustering, correlations, and anomalies.

Later: attractor reconstruction, Lyapunov-style diagnostics, symbolic invariant discovery, automated conjecture generation, dimensional/scaling law discovery, and hypothesis graphs.

Output observations and candidate structures — never fabricated proof.

## Phase 5 — Comparison laboratory
Comparison is a separate subsystem.

~~~text
NEW MODEL vs NEW MODEL
NEW MODEL vs REFERENCE
NEW MODEL vs LIMITING CASE
NEW MODEL vs EXPERIMENTAL DATA
RUN A vs RUN B
~~~

Report agreement, approximate agreement, divergence, regime-specific agreement, systematic bias, qualitative similarity, structural similarity, and unexplained difference.

Never collapse all comparison into one accuracy score.

## Phase 6 — Numerical integrity
Before interpreting a surprising result: repeat it; change resolution; change timestep; change precision; perturb initial conditions; use another solver where possible; check invariant/residual drift; repeat with an independent implementation if important.

## Phase 7 — Reproducibility and evidence ledger
- [x] Add a provider-neutral external research acquisition boundary.
- [x] Preserve provider/source/timestamp/revision/fingerprint/limitation metadata.
- [x] Keep external research explicitly untrusted and separate from scientific interpretation.

Every experiment becomes a durable evidence object recording experiment, hypothesis, model/version, source revision, parameters, initial state, seeds, engine, solver, precision, environment, observations, analyses, comparisons, artifacts, logs, result status, and open questions.

Use local SQLite initially, Git for source provenance, and content hashes for definitions, inputs, outputs, and artifacts. Cloud databases are optional.

## Phase 8 — Trusted/untrusted execution
Execution classes: native trusted; adapter; sandboxed candidate; optional remote sandbox.

For untrusted code: isolated filesystem, no network by default, timeout, CPU/memory limits, explicit I/O boundary, captured logs, captured exit status.

Container isolation is not a perfect hostile-code boundary. Public arbitrary-code execution requires stronger isolation than a private local lab.

## Phase 9 — automate bridge
The separate Math/Physics suite remains separate.

~~~text
Mirror experiment
      |
      v
automate adapter
      |
      v
canonical calculation
      |
      v
Mirror observation / analysis
~~~

No production formula is copied merely for convenience.

## Phase 10 — Human-facing laboratory
A human-facing interface is deliberately **not** the next priority.

First make the AI operator capable of performing the complete experimental lifecycle. Only after that should we add CLI ergonomics, notebooks/reports, optional API, optional web UI, interactive parameter sweeps, trajectories, phase-space views, comparison plots, experiment browser, and evidence explorer.

The UI is a window into the laboratory, not the laboratory itself.

## Phase 11 — Advanced discovery
Future areas: dimensional analysis, symbolic regression, invariant/conservation-law discovery, equation discovery, sparse model discovery, bifurcation analysis, continuation methods, parameter identifiability, uncertainty quantification, Bayesian model comparison where appropriate, surrogate models, active experiment design, GPU/parallel sweeps, distributed execution.

Add these because an experiment needs them, not because they sound sophisticated.

## Technology policy
Prefer Python scientific ecosystem, NumPy/SciPy, SymPy, Pint, uncertainties, xarray, SALib, Hypothesis, NetworkX, Mesa, and JAX only when justified.

Optional: Snakemake, Quarto, DVC or similar data-versioning tools, remote execution providers.

Do not make Vercel, Supabase, Drizzle, Next.js, hosted databases, or cloud sandboxes core dependencies.

The scientific core must run on one machine with no cloud account.

## Definition of done
THE MIRROR is not done when a web page can submit a formula.

The first meaningful milestone is:
~~~text
AI hypothesis
  -> executable model
  -> controlled experiment
  -> simulation
  -> raw observations
  -> perturbation
  -> numerical diagnostics
  -> discovery analysis
  -> reproducible evidence package
  -> AI proposes the next experiment
~~~

The lab is mature when it can take a genuinely novel rule and tell us what it does, including when the answer is surprising or unknown.

## Anti-drift checklist
Before adding a feature ask:
1. Does it help the AI perform an experiment?
2. Does it help observe or characterize behavior?
3. Does it improve reproducibility?
4. Does it distinguish numerical artifact from model behavior?
5. Does it preserve unexpected results?
6. Is it an instrument rather than a hidden theoretical assumption?
7. Could an existing open-source project already do this better?
8. Does this belong in automate instead?
9. Does this require a human to do work the AI can reliably perform?

If #8 is yes, keep it out of Mirror.
If #9 is yes, prefer an AI-operable interface.

## Permanent warning
**Do not turn THE MIRROR into another calculator that merely rediscovers established physics.**

The Math/Physics suite already provides that foundation.

**THE MIRROR exists to let ideas run.**


## Architecture reconciliation — Verification & Reconciliation Engine

THE MIRROR is not merely a passive source of evidence. Its existing laboratory machinery is one of the scientific execution compartments available to the cross-repository Verification & Reconciliation Engine.

Chanfana owns durable cross-repository execution and transport. Mirror owns scientific execution. Automate owns canonical mathematics/physics semantics and final authority.

During the current Stage 1A–3A backlog phase, Mirror may be commissioned for tightly bounded verification work when a claim needs simulation, perturbation, numerical diagnostics, convergence/stability investigation, independent solver routes, or counterexample search.

This is distinct from autonomous open-ended discovery. External-world research and uncontrolled discovery remain ON HOLD until the system's activation policy permits them.

The intended path is:

```
Verifier
  -> Chanfana durable request
  -> Mirror laboratory
  -> raw observations + diagnostics + provenance
  -> Chanfana transport/persistence
  -> verifier diagnosis/evidence assembly
  -> Automate authority decision
```

Mirror must preserve surprising, contradictory, or unresolved observations rather than normalizing them into pass/fail. The verifier is responsible for diagnosing whether an anomaly is an implementation problem, numerical artifact, assumption mismatch, or unresolved behavior.

Mirror must never mutate Automate's ledger, capability inventory, rule registry, certification state, or authoritative Git history.
