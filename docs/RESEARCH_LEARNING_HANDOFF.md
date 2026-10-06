# Mirror → Automate Learning Handoff

THE MIRROR can now package observations into the existing
`mirror.research_proposal.v1` contract through a deterministic builder.

The builder is deliberately not a discovery oracle. An AI operator, experiment
analysis routine, or future local model supplies the candidate capability
description and evidence references. The builder only:

1. canonicalizes the supplied candidate/evidence inputs;
2. creates a deterministic proposal identifier;
3. attaches the explicit untrusted authority marker;
4. validates the resulting proposal with the existing Zod contract.

The downstream path remains:

```
Mirror observation
  ↓
candidate capability hypothesis
  ↓
mirror.research_proposal.v1
  ↓
Chanfana durable transport
  ↓
Verification & Reconciliation Engine
  ↓
Automate learning / capability intake
  ↓
reproduction + regression + implementation
  ↓
Automate authority
```

A proposal never changes the Automate ledger. Established physics may be used
as a comparison instrument, but disagreement with it is recorded as an
investigative result rather than a rejection criterion.
