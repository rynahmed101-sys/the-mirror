# Model-independent runtime policy

THE MIRROR's scientific core and application-facing provider registry are model-independent.

The safe baseline runtime is:

- provider: `model-independent`
- model: `deterministic-cognitive-substrate`
- inference network: disabled
- API keys: not required
- model downloads: not required

An optional vendor-neutral `remote-http` provider can be enabled by deployment configuration (`MIRROR_AI_ENDPOINT`, optional `MIRROR_AI_TOKEN`, and `MIRROR_AI_MODEL`). It uses the same AIProvider contract and is not tied to any specific model vendor.

The deterministic provider can route bounded evidence requests into the existing Mirror tool surface. It is not a substitute for a trained language model and must not be described as one.

The remote provider is still only a reasoning engine. It must not become a scientific authority, replace persistent memory, or bypass Automate verification.

Legacy hosted/local model integrations are not part of the active architecture and must not be reintroduced as dependencies.

## Authority boundary

Mirror stores memory, reasoning state, evidence and proposals.

Chanfana transports bounded work.

Automate remains the independent verifier and canonical scientific authority.

No provider may change that boundary.
