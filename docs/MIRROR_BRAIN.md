# Mirror AI Brain

Mirror Brain is the persistent cognitive substrate of THE MIRROR. It is not a
language model and does not require one.

The design combines useful ideas found in public brain/agent projects with the
existing Mirror safety boundary:

- deterministic local memory instead of a remote vector service;
- episodic, semantic, procedural, working, goal, belief, and self-audit state;
- provenance on recalled memories;
- confidence-bearing beliefs;
- explicit goal state;
- bi-temporal fields and supersession hooks;
- sleep-like consolidation;
- non-destructive unlearning with an audit event;
- bounded priority decisions: repair -> current backlog -> ledger frontier ->
  Automate request -> discovery;
- SQLite WAL persistence, so the brain survives process restarts;
- no model download, cloud inference, API key, token quota, or paid service.

## What this means

A language model, if one is ever attached, becomes a reasoning/expression
component. It does not own identity, memory, goals, beliefs, history, or
scientific authority.

Mirror Brain also does not certify science. It records observations,
provenance, decisions, failures, and evidence. Automate remains the external
verification and promotion authority.

The brain deliberately prefers false negatives and preserves uncertainty. A
future model can ask it for context, propose an action, or request a tool, but
the resulting proposal still passes through the existing Mirror/Automate
verification boundary.

## Cognitive layers

1. Working memory: current-cycle transient context.
2. Episodic memory: observations and events.
3. Semantic memory: repeated observations promoted by consolidation.
4. Procedural memory: named workflows and their success/failure history.
5. Goals: explicit desired states with lifecycle.
6. Beliefs: confidence-bearing claims with evidence and revision.
7. Self-audit: append-only learning/state-change events.
8. Attention: deterministic recall biased toward active goals and recent evidence.

The first implementation is intentionally plain. It is a foundation, not a
claim that SQLite plus token overlap has somehow solved cognition, because
humanity has already produced enough marketing departments doing that job.

## Provenance

Every memory has source, confidence, timestamp, content hash, and recall
provenance. Every mutation emits an append-only audit event. Unlearning
tombstones a memory rather than deleting its history.

## Scientific boundary

The brain may store unconventional mathematics or physics as hypotheses,
observations, experiments, or beliefs with explicit confidence. It must never
turn a stored belief into a certified scientific result merely because it
survived a conversation.

## Influences

The architecture was informed by public design ideas in agidb, Nous, and
several AI second-brain projects supplied for this work. No external project
is treated as scientific authority, and the implementation is native to
Mirror's existing contracts.
