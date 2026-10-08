# Executable agent boundary

The Python package is the runnable Mirror core. The agent/toolbelt boundary is therefore implemented here, not only in an unrelated application tree.

The executable toolbelt currently exposes bounded:
- world research;
- local experiment execution;
- exact-SHA Automate patch probing;
- repair through the same patch chamber;
- untrusted capability proposal generation;
- toolbelt introspection.

The reasoning planner is deliberately conservative. A future or configured reasoning provider can replace planning, but it must consume this registry and executor rather than receiving direct filesystem/GitHub authority.

The implementation tool never pushes, merges, certifies, or changes Automate authority. It returns an untrusted patch/evidence package.

## Important limitation

This closes the **runtime/toolbelt** gap. It does not pretend that a deterministic keyword planner is equivalent to a capable reasoning model. Capability synthesis still requires a reasoning provider capable of producing a valid patch or proposal. That provider is an adapter, not the authority.
