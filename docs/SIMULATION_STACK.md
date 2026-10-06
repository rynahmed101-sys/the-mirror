# THE MIRROR — SIMULATION & ANALYSIS STACK

## Principle
There is no single simulation engine for mathematical physics. A hypothesis determines the appropriate computational representation.

| Experimental need | Instrument class | Initial direction |
|---|---|---|
| Iterative/discrete rules | custom deterministic runner | native Mirror |
| ODE dynamics | numerical ODE solver | SciPy |
| Symbolic equations | CAS | SymPy |
| Units/dimensions | quantity system | Pint |
| Uncertainty propagation | uncertainty arithmetic | uncertainties |
| Multidimensional scientific arrays | labeled arrays | xarray |
| Agent interactions | agent-based modeling | Mesa |
| Graph/relational dynamics | graph algorithms | NetworkX |
| Parameter sensitivity | global sensitivity | SALib |
| Property/edge-case exploration | property-based testing | Hypothesis |
| High-performance/autodiff | array compiler/autodiff | JAX, only when justified |
| Large specialized physics | domain-specific engine | evaluated case-by-case |

## Why we do not build these ourselves first
Mature scientific packages contain years of numerical work, testing, documentation, and domain expertise.
Mirror should contribute the missing layer: experiment orchestration + observation + discovery + provenance.
SALib's separation between model execution and sensitivity sampling/analysis is a useful architectural pattern. Mesa is useful where local interactions may produce system-level behavior. SymPy already covers symbolic physics and mechanics workflows. JAX is useful where autodiff, vectorization, JIT, or accelerator execution is justified.

## Engine adapter contract
Conceptually:
~~~text
prepare(experiment)
    -> initialize(model, initial_state, parameters)
    -> step(state, dt / event)
    -> observe(state)
    -> finalize()
~~~
An engine may execute an entire problem at once; it still returns standardized observations and provenance.

## Discovery is not simulation
Simulation answers: What does the model produce?
Discovery analysis asks: What structure is present in what the model produced?
Keep those layers separate. A solver must not secretly decide that an oscillation is physical. Analysis should report detected periodicity and its conditions; the researcher decides what it means.

## Reference models
Reference models are first-class instruments: established laws, known mathematical systems, alternate hypotheses, analytical solutions, benchmark problems, or empirical datasets.
A reference comparison is always labeled by its role. Never silently turn a reference into an acceptance criterion.

## Numerical trust ladder
Before interpreting a surprising result: repeat it; change resolution; change timestep; change precision; perturb initial conditions; use another solver where possible; check invariant/residual drift; repeat with an independent implementation if the result matters.
A phenomenon that survives these checks becomes more interesting, but is not automatically true physics.

## Research outputs
Prefer trajectories, state snapshots, parameter-response surfaces, phase portraits, distributions, invariant traces, residuals, sensitivity maps, regime maps, anomaly records, comparisons, and reproducibility metadata.