# THE MIRROR — Experimental Mathematics & Physics Laboratory

THE MIRROR is a laboratory for letting mathematical and physical ideas **run**.

It is not a second calculator whose job is to rediscover established physics. The separate Math/Physics suite (automate) owns canonical calculations. Mirror exists to experiment with hypotheses, models, relations, simulations, and unverified ideas — including ideas whose behavior is unknown or unlike established theory.

## The central question
> Given these assumptions and this formal system, what happens?

~~~text
IDEA / HYPOTHESIS
       ↓
FORMALIZATION
       ↓
MODEL / RULE SET
       ↓
EXECUTION / SIMULATION
       ↓
OBSERVATION
       ↓
DISCOVERY / CHARACTERIZATION
       ↓
REPRODUCTION + NUMERICAL INTEGRITY
       ↓
OPTIONAL COMPARISON
       ↓
EVIDENCE
~~~

## What Mirror is NOT
- It does not require a novel model to reproduce GR, Newton, QM, or any other established theory.
- It does not treat disagreement with established physics as automatic failure.
- It does not reduce scientific behavior to one accuracy score.
- It does not assume every experiment has a known expected answer.
- It does not put production calculation logic from automate into the lab.

## What Mirror investigates
- What a new rule actually produces.
- Whether behavior is stable, unstable, oscillatory, divergent, convergent, periodic, chaotic, or regime-dependent.
- Whether invariants, symmetries, scaling relations, or emergent structures appear.
- Whether an observed phenomenon survives perturbation, precision changes, resolution changes, and independent implementations.
- Where a new model agrees with, differs from, or becomes equivalent to a reference model.
- What remains unknown.

## Simulation is plural
Mirror will use the appropriate instrument for the experiment rather than forcing every problem into one simulator.
- deterministic discrete systems
- ODE and dynamical systems
- PDE and field systems when required
- stochastic and Monte Carlo systems
- agent-based interaction models
- graph/network dynamics
- symbolic mathematics
- parameter sweeps and sensitivity analysis
- differentiable/high-performance computation when justified

Where mature open-source scientific tools already exist, Mirror should use them rather than reinvent them.

## Architecture memory
Read these before changing the scientific architecture:

- ROADMAP.md — the persistent research and engineering roadmap.
- docs/LAB_CONSTITUTION.md — the non-negotiable scientific philosophy.
- docs/SIMULATION_STACK.md — the simulation and analysis instrument strategy.

## Repository boundary
THE MIRROR owns experimental orchestration, simulation adapters, observations, discovery analysis, comparisons, provenance, reproducibility, and evidence.

automate owns canonical formulas, constants, units, symbolic derivations, numerical algorithms, and production calculations.

Mirror may call automate through an adapter. It must not quietly become automate.

## Infrastructure rule
The scientific core must work offline on one machine. Vercel, Supabase, Drizzle, Next.js, hosted databases, and cloud sandboxes are optional infrastructure — never scientific requirements.

## First meaningful milestone
~~~text
hypothesis
  -> executable model
  -> controlled experiment
  -> simulation
  -> raw observations
  -> perturbation
  -> numerical diagnostics
  -> discovery analysis
  -> reproducible evidence package
~~~

## Permanent warning
**THE MIRROR exists to let ideas run. Do not turn it into another system that only converges on what we already believe.**

License: MIT