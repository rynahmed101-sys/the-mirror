> **System authority:** The complete cross-repository architecture and infrastructure plan is maintained in Automate at `docs/AUTONOMOUS_SYSTEM_MASTER_PLAN.md`. This repository-local document defines only this repository's role and must not override that master plan.

# Engine role

THE MIRROR is the experimental mathematics and physics laboratory for the autonomous engine.

It may formulate hypotheses, execute simulations, perturb models, search for counterexamples, compare independent numerical routes, and preserve reproducible observations.

Mirror evidence is authoritative only inside Mirror's evidence model. To Automate it is external evidence and must be independently evaluated.

Mirror must never mutate Automate's phase ledger, capability inventory, rule registry, certification state, or Git history.

The `engine` branch is the active integration trunk for continued laboratory development. The certified `main` branch is a release surface and does not block laboratory progress.

Experiments should preserve reproducibility metadata and stable correlation identifiers where a run originated from the autonomous engine.


## Verification Engine boundary

The Verification & Reconciliation Engine is separate from the laboratory. It may request Mirror experiments through Chanfana after the verification-backlog hold is cleared, but it must never absorb the laboratory or force hypotheses to conform to established physics.

Mirror produces observations and evidence. The verifier may inspect and package that evidence, but Automate remains the final authority.

## Activation order

During the initial verification-backlog phase, Mirror/external research remains ON HOLD. After backlog clearance and readiness gates, the permitted path is: Verification Engine -> Chanfana bounded job -> Mirror laboratory -> raw observation/provenance -> Chanfana -> Verification Engine -> verifiable packet -> Automate decision.

Established mathematics and physics remain optional comparison instruments, not hidden acceptance criteria.
