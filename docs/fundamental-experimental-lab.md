# Fundamental Experimental Lab

This layer is deliberately source-first. It provides C1 deterministic replay, C2 full trajectory instrumentation, C3 Cartesian parameter sweeps, provenance hashing, and an E0 baseline runner for a source-backed 96-node transition function.

## Current model gate — 2026-09-29

The production Mirror repository contains a 96-node behavioral controller (`src/lib/lab/brain96.ts`) and a static sparse perturbation fixture (`src/lib/agent/perturbationLab.ts`). Neither exposes the evolving transition law needed for the physical E0–E4 probes.

The library contains an archived evolving trajectory (`96node_layered_simulation_metrics.csv`) and a separate Part 153 96-node algebraic test surface. These are evidence and test surfaces, not substitutes for a missing transition implementation.

The harness therefore refuses to run a physical E0 baseline without an explicit `TransitionFunction`. This is intentional: an output-matched reconstruction would mix model inference with source execution and would violate the experiment order.

## Record contract

Every experiment record stores:

`experiment_id,protocol_version,model_version,engine_version,seed,initial_state,parameters,perturbation,topology,coupling,raw_trajectory,events,derived_measurements,final_state,classification`

`classification` is restricted to the discovery firewall states defined in `core.ts`.

## Next source gate

Locate or restore the exact transition implementation that produced the archived layered trajectory. Then instantiate `ModelDefinition`, run E0 across repeated seeds/initial states, and promote only measurements that survive C1–C3 and representation/control changes.
