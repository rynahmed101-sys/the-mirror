> **System authority:** The complete cross-repository architecture is maintained in Automate at `docs/AUTONOMOUS_SYSTEM_MASTER_PLAN.md`. This document defines Mirror's implementation role.

# THE MIRROR role: autonomous AI engineering partner, scientific laboratory, and verification worker

THE MIRROR is the system's persistent AI engineering environment. It is a laboratory, research brain, coding workspace, diagnosis/repair worker, capability-generation partner, and scientific execution compartment of the Verification & Reconciliation Engine.

It is not merely a passive evidence mailbox. It can perform substantial technical work, including research, implementation design, coding, testing, diagnosis, repair, experiment design, and discovery.

## What Mirror owns

Mirror owns the machinery and intelligence for:

- formalizing hypotheses and computational models;
- scholarly, scientific, and code research;
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
- capability design and implementation proposals;
- diagnosis of software, mathematical, numerical, provenance, test, CI, and integration failures;
- bounded repairs and repair proposals;
- follow-up work and discovery candidates.

## Capability generation and repair

Mirror may be commissioned to:

1. investigate the next Automate capability;
2. research existing implementations and methods;
3. design a capability vertical slice;
4. implement or prepare implementation changes;
5. build adversarial and negative tests;
6. investigate verification failures;
7. diagnose the smallest justified repair;
8. produce a repair branch/PR or a bounded worker result;
9. run scientific experiments required to distinguish competing explanations.

Mirror may work directly on its own repository and may prepare reviewable Git changes for Automate. This is how the system can develop rather than merely observe itself.

The boundary is not "Mirror may not mutate." The boundary is:

**Mirror may mutate implementation surfaces through bounded, attributable, reviewable Git changes; Mirror may not self-certify, self-promote, or bypass Automate's acceptance boundary.**

## Verification relationship

Mirror participates in verification whenever computation, experiment, perturbation, numerical comparison, simulation, or counterexample search materially strengthens the evidence.

A verification request may therefore become:

```
Automate / Verification Engine
        ↓
Chanfana durable request
        ↓
Mirror research / code / experiment
        ↓
observations + diagnostics + provenance
        ↓
Chanfana persistence
        ↓
Automate verification + reconciliation
        ↓
promotion decision
```

Mirror can recommend that a claim is supported, contradicted, unresolved, numerically unstable, or requires another experiment. It cannot turn that judgment into an authoritative Automate certification.

## Backlog-clearing role

Mirror is available during the Stage 1A–3A backlog phase, not only after the backlog disappears.

For a capability currently selected by Automate, Mirror may contribute whenever useful:

- implementation research;
- test-matrix design;
- numerical cross-checks;
- convergence/stability investigation;
- perturbation;
- independent solver comparison;
- counterexample search;
- code repair;
- documentation and contract preparation.

Open-ended discovery remains controlled by the Automate operating mode. That is a work-selection rule, not a declaration that Mirror is technically incapable of discovery.

## Chanfana relationship

Mirror should not recreate durable queues, leases, worker authentication, or cross-repository job persistence.

When work crosses repository boundaries, use shared contracts and Chanfana transport:

```
Automate mission
  → Chanfana job
  → Mirror execution
  → Chanfana persistence
  → Automate reconciliation
```

Mirror remains locally useful without Chanfana so the scientific core stays independently runnable.

## Scientific neutrality

Established mathematics and physics are reference instruments, controls, limiting cases, or competing models. Disagreement with them is not automatically a defect and not automatically evidence of new science.

Unexpected results must first be checked for implementation and numerical causes, then preserved if they survive.

## Development rule

The `engine` branch is the active development trunk. `main` is the release surface.

Mirror must not mutate Automate's canonical ledger, certification state, or authoritative decision directly. Any cross-repository mutation must travel through a bounded, reviewable Git/control path.
