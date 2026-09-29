# Fundamental Experimental Lab

PROJECT=GRAND_THEORY_FUNDAMENTAL_EXPERIMENTAL_LAB
MODE=SOURCE_FIRST,RIGOROUS,ASSUMPTION_LIGHT,EXPERIMENT_FIRST

## Model identity

The experimental program treats the 96-node framework as ONE mathematical model with multiple implementations and experimental surfaces.

The candidate unified object is the coupled 96-node state described by the 96-Node Unified Physical–Informational–Cognitive Model: physical, informational, computational, observer/self-model, history, adaptive-parameter, coupling, and potentially dynamic-topology sectors are components of the same state. The document explicitly frames this as a candidate framework whose physical/geometry/cognition claims still require demonstration.

Therefore:

- Gemini 96-node calculation and an independent GPT 96-node calculation are independent implementations of the SAME MODEL.
- The historical layered metrics trajectory is SAME-MODEL experimental evidence, not a different model.
- Mirror `brain96.ts`, the projection/sandbox chamber, and related agent experiments are DIFFERENT EXPERIMENTAL SURFACES of the same broader mathematical program; they must not be silently substituted for the evolving layered transition law.
- Part 153/154 constructions are DERIVED TEST SURFACES and gates, not automatically the microscopic simulator.

Cross-implementation disagreement is an empirical test of the model/implementation, not a reason to redefine the implementations as different theories.


## Reference transition now implemented

The repository now contains `src/lib/experimentalLab/unified96Transition.ts`.

It implements only the relational transport term explicitly written in the unified-model source:

`T_i = sum_j A_ij(X_j - X_i)`

with a synchronous explicit-Euler step:

`X_i(t+dt) = X_i(t) + dt*T_i(t)`

All 96 nodes read the same pre-step state. A right-to-left or left-to-right node-by-node sweep is intentionally not used because update ordering is not specified by the source and would introduce an additional dynamical assumption.

This implementation is therefore a SOURCE-GROUNDED PARTIAL REFERENCE TRANSITION, not a claim to have recovered the historical Gemini/GPT transition law. The missing pieces remain the actual initial state, the historical topology/coupling, the dynamic A_ij(X,t) generator, and the remaining force/interaction sectors.

## Current source gate

The Mirror repository does not currently expose the exact evolving 96-node transition implementation that generated the retained layered metrics trajectory.

This creates an OPEN source-recovery gate, not a model-identity split.

The lab must not:
1. infer a transition law from the output;
2. fit parameters until the result matches the archived curve;
3. call that reconstruction "source execution".

Until the transition source is recovered, the historical run is valid for evidence extraction, provenance tracking, cross-engine comparison planning, and falsification tests, but not for a fresh source-backed E0 rerun.

## Experimental order

`unknown_model -> controlled_probe -> raw_response -> repeatability -> cross_probe_comparison -> invariant/candidate_quantity -> mathematical_relation -> physical_interpretation`

Do not promote names such as energy, momentum, time, space, mass, temperature, entropy, gravity, phase, metric, Lorentzian signature, causal cone, action, Hamiltonian, or quantum structure to primitives merely because they occur in earlier documents or output columns. Earn operational quantities from repeatable behavior.

## Engine stack

C1 deterministic replay
C2 full trajectory instrumentation
C3 parameter perturbation matrix
C4 sensitivity/Jacobian
C5 conservation discovery
C6 symmetry discovery
C7 scaling
C8 spectral/wave
C9 empirical causality/influence
C10 automated hypothesis discovery

Initial physical probes remain:
E0 baseline
E1 Fire
E2 Water
E3 Earth
E4 Air
E5 Vacuum
E6 Collision
E7 Vortex
E8 Gravity-like
E9 Observer

The Fire/Water/Earth/Air names are experimental regimes, not separate ontologies. The model document explicitly describes them as regimes of the unified `𝓧` state.

## Record contract

Every executed run must preserve:

`experiment_id,implementation_id,provenance,protocol_version,model_version,engine_version,seed,initial_state,parameters,perturbation,topology,coupling,raw_trajectory,events,derived_measurements,final_state,classification`

Raw state and raw events are retained separately from derived measurements. Provenance must identify the implementation/run source.

## Historical 96-node evidence

The library retains `96node_layered_simulation_metrics.csv` and `96node_simulation_summary.csv`.

These records show a 96-node evolving trajectory and associated measurements, including phase coherence, phase spread, edge entropy, strong-edge density/fraction, temperature, order score, activity, connected components, and summary extrema. They are historical measurements; their column names are labels, not axioms.

A useful immediate check already established is that the archived strong-edge-density and strong-edge-fraction columns are normalization variants, not independent observables:

`strong_edge_density = (96/95) * strong_edge_fraction`

Residual tolerance should be tested numerically before using both as separate features.

## Next executable gate

Recover or attach the exact transition source used by the Gemini/GPT 96-node implementations, then register that implementation with `runE0Baseline`.

Only after E0 is source-backed should C1-C3 be run systematically across independent implementations and the E1-E9 perturbation sequence be opened.

The central rule is:

`ONE_MODEL + MULTIPLE_IMPLEMENTATIONS + MULTIPLE_EXPERIMENTS + EXPLICIT_PROVENANCE`

not:

`ONE_VISIBLE_CODEBASE = ONE_MODEL`.
