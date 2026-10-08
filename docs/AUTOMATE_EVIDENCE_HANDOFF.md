# Automate Evidence Handoff

THE MIRROR is an experimental laboratory and a scientific execution compartment of the Verification & Reconciliation Engine. It is not an authority for Automate capabilities.

## Evidence packet

For a mathematical or physics capability under development, Mirror may receive a bounded experiment request and return a reproducible observation packet containing:

- capability ID;
- action-cycle/request ID;
- source revision when known;
- hypothesis or numerical question;
- exact inputs and assumptions;
- experiment/run identifiers;
- raw observations;
- runtime and error measurements;
- stability/convergence classification;
- independent comparison route when available;
- source code/data fingerprints;
- unresolved limitations;
- provenance/environment metadata.

## Verification-engine handoff

The normal path is:

```
Verification Engine
  → Chanfana bounded job
  → Mirror laboratory
  → raw observations + diagnostics + provenance
  → Chanfana transport/persistence
  → Verification Engine
  → verifiable packet
  → Automate authority decision
```

Mirror performs the experiment. The verifier diagnoses and integrates the evidence. Automate decides.

For convergence-sensitive mathematics such as improper integrals, prefer families of truncations, perturbations, precision/resolution changes, and independent numerical routes rather than reproducing one expected answer.

Divergence, instability, cutoff sensitivity, disagreement, and UNKNOWN/UNRESOLVED remain first-class outcomes.

## Backlog phase

The current Stage 1A–3A verification backlog remains the first production workload.

Autonomous external-world research and open-ended Mirror discovery remain ON HOLD. However, Mirror's existing local laboratory may be used for tightly bounded verification experiments when a backlog item genuinely requires scientific execution.

## Permanent boundary

No Mirror workflow may silently promote an observation into Automate's authoritative registry, capability inventory, ledger, or certification state.

An experiment is evidence. A verifier packet is evidence. Only Automate can make the authoritative decision.
