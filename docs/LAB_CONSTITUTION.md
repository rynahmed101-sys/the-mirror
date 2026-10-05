# THE MIRROR — LABORATORY CONSTITUTION

## 1. What this system is
THE MIRROR is an exploratory mathematical and physical laboratory.
Its job is NOT to force a new idea to reproduce established mathematics or physics. Its job is to let an idea, relation, model, rule, or computational construction operate under explicit conditions and then discover, measure, record, and investigate what it actually does.
Established theories may be used as references, controls, limiting cases, or competing models — not automatic judges of novelty.
> Given these assumptions and this formal system, what happens?

## 2. Separation from the Math/Physics suite
The separate Math/Physics suite (automate) owns canonical formulas, production numerical algorithms, constants, units, symbolic derivations, and established calculation machinery.
THE MIRROR owns hypotheses, experimental definitions, executable model adapters, simulation and state evolution, exploratory parameter spaces, observations, internal-consistency checks, stability and sensitivity analysis, invariant and symmetry searches, regime and transition detection, anomaly capture, reference comparisons, reproducibility, provenance, and evidence history.
THE MIRROR must never absorb production calculation logic merely because an experiment needs it.

## 3. Primary scientific loop
~~~text
IDEA / HYPOTHESIS
       |
       v
FORMALIZATION
       |
       v
MODEL / RULE SET
       |
       v
INITIAL CONDITIONS + PARAMETERS
       |
       v
EXECUTION / SIMULATION
       |
       v
OBSERVATION
       |
       v
DISCOVERY ANALYSIS
       |
       +-----------------------------+
       |             |               |
       v             v               v
 CONSISTENCY     STABILITY        SURPRISE
       |             |               |
       +-------------+---------------+
                     |
                     v
             OPTIONAL COMPARISON
                     |
                     v
                  EVIDENCE
~~~
A failed comparison with an established theory is therefore an observation, not automatically a failed experiment.

## 4. Valid result states
Keep these distinct: implementation correctness; internal consistency; numerical reliability; stability; sensitivity; dimensional validity where applicable; mathematical structure; observed dynamics; agreement with a reference; disagreement with a reference; reproducibility; unexplained or unresolved behavior.
The system must be able to report UNKNOWN without converting it into PASS or FAIL.
Surprising results must be preserved rather than silently normalized away.

## 5. No convergence mandate
There is no architectural rule that a novel hypothesis must converge toward Newtonian mechanics, general relativity, quantum mechanics, standard cosmology, or any other established theory.
Established systems can be reference implementations, controls, special-case checks, limiting-case comparisons, or competing hypotheses. They must not become hidden acceptance criteria.

## 6. Experiments before verdicts
Experiments may have known expected outcomes, bounded expectations, qualitative expectations, competing predictions, or no expected answer at all.
For open-ended experiments, observation and discovery take priority over pass/fail scoring.

## 7. Simulation is plural
THE MIRROR will not build one universal simulator. It will expose a common experiment interface over specialized engines:
- deterministic discrete state-transition systems;
- ordinary differential equations;
- partial differential equations;
- stochastic processes and Monte Carlo;
- agent-based and interaction systems;
- graph and network dynamics;
- symbolic equation systems;
- numerical optimization and parameter sweeps;
- sensitivity analysis;
- eventually differentiable and high-performance simulation where justified.
Existing open-source engines should be used whenever they fit. We should not recreate mature numerical infrastructure.

## 8. Discovery is first-class
The laboratory must eventually support invariant discovery, symmetry discovery, conservation-like quantities, fixed points, periodic orbits, attractors, bifurcations and regime changes, dimensional and scaling relationships, sensitivity structure, correlations, recurrence, divergence, oscillation, chaos indicators, emergent collective behavior, anomalous trajectories, and unexplained residual structure.
These are observations to investigate, not proof of a theory.

## 9. Numerical failure versus conceptual failure
A strange result may come from implementation error, insufficient precision, discretization error, solver error, timestep choice, stiffness, floating-point behavior, unstable numerical formulation, or resource exhaustion.
Numerical diagnostics must therefore precede interpretation of unusual behavior.
Conversely, a numerically stable result that disagrees with established physics must not be discarded merely because it disagrees.

## 10. Reproducibility
Every meaningful run should record the experiment definition, hypothesis/model version, source revision, parameters, initial conditions, random seeds, engine and solver configuration, precision, environment, platform/runtime, input hashes, output hashes, and analysis configuration.
Raw observations should be retained whenever practical.

## 11. Promotion is about execution trust, not truth
Moving code from untrusted to trusted execution means: we trust this implementation enough to use it as an experimental instrument.
It does NOT mean: the hypothesis has been proven.

## 12. Forbidden shortcut
Never make this the default:
~~~text
new hypothesis -> compare with established theory -> mismatch -> reject
~~~
The default must be:
~~~text
new hypothesis -> execute -> observe -> characterize -> reproduce -> investigate -> optionally compare
~~~

## 13. Architectural principle
> THE MIRROR must remain a laboratory even when the answer is inconvenient, unexpected, unknown, or unlike established physics.
Cloud infrastructure, web frameworks, databases, visualization libraries, and external services are replaceable infrastructure. The scientific experiment is not.