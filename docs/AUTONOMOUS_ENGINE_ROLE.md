> **System authority:** The complete cross-repository architecture is maintained in Automate at `docs/AUTONOMOUS_SYSTEM_MASTER_PLAN.md`. This document defines Mirror's implementation role.

# THE MIRROR role: scientific laboratory and verification execution compartment

THE MIRROR is the autonomous scientific laboratory. It is also a **scientific execution compartment of the Verification & Reconciliation Engine** when a verification task requires real experimentation rather than repository-only reasoning.

It is not a passive evidence mailbox, and it is not an authority for Automate.

## What Mirror owns

Mirror owns the machinery for:

- formalizing hypotheses/models;
- executable experiment design;
- deterministic and numerical simulation;
- perturbation and parameter sweeps;
- solver/precision/resolution changes;
- convergence and stability diagnostics;
- counterexample searches;
- independent numerical routes;
- discovery analysis;
- anomaly preservation;
- reproducible experiment manifests;
- raw observations and experimental provenance;
- follow-up experiment generation.

Its existing Python laboratory, operator facade, evidence ledger, simulation adapters, analysis and perturbation machinery make it materially richer for these tasks than a generic worker substrate.

## Backlog-clearing role

Mirror may help clear the current Stage 1A–3A verification backlog when a backlog item needs:

- numerical cross-checking;
- convergence/stability investigation;
- perturbation;
- independent solver comparison;
- counterexample search;
- simulation;
- anomaly characterization.

This does **not** turn backlog clearing into unrestricted scientific discovery.

During the backlog phase, autonomous external-world research and open-ended discovery remain ON HOLD. Existing local laboratory capabilities can be commissioned through bounded verifier jobs when required.

## Verification boundary

The verifier asks:

> What should be checked, what evidence is missing, and what experiment would distinguish competing explanations?

Mirror answers by running the experiment and returning observations.

Mirror does not answer:

> Therefore this capability is authoritative.

That decision remains with Automate.

## Chanfana relationship

Mirror should not recreate durable queues, leases, worker authentication, or cross-repository job persistence.

When work originates from the verifier:

```
Verification Engine
 → Chanfana durable request
 → Mirror experiment
 → raw observation + diagnostics + provenance
 → Chanfana transport/persistence
 → Verification Engine
```

Mirror remains locally useful without Chanfana, preserving its laboratory independence, but autonomous cross-repository jobs should use the shared Chanfana transport/control boundary.

## Theory neutrality

Established mathematics and physics are optional comparison instruments, controls, limiting cases, or competing models. Disagreement with them is not automatically a defect and not automatically evidence of new science.

Unexpected results must first be checked for implementation and numerical causes, then preserved if they survive.

## Development rule

The `engine` branch is the active laboratory development trunk. `main` is the release surface.

Mirror must never mutate Automate's ledger, inventory, rule registry, certification state, or authoritative Git history.
