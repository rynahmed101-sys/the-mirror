import test from "node:test";
import assert from "node:assert/strict";
import {
  experimentFingerprint,
  parameterMatrix,
  replayDeterministic,
  runE0Baseline,
  stableStringify,
  validate96NodeTopology,
} from "../src/lib/experimentalLab/core";
import { GRAND_THEORY_96_NODE_MODEL } from "../src/lib/experimentalLab/modelInventory";

function model() {
  const nodes = Array.from({ length: 96 }, (_, index) => ({ id: `n${index}`, index }));
  const edges = Array.from({ length: 95 }, (_, index) => ({ from: `n${index}`, to: `n${index + 1}` }));
  return {
    modelVersion: "fixture-96-v0",
    engineVersion: "fixture-engine-v0",
    nodes,
    edges,
    coupling: { declared: true, value: 1 },
    parameters: { gain: 1 },
    initialState: { values: Array.from({ length: 96 }, () => 0) },
  };
}

test("stable serialization ignores object-key insertion order", () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
});

test("96-node topology validator enforces count and unique ids", () => {
  validate96NodeTopology(model());
  assert.throws(() => validate96NodeTopology({ ...model(), nodes: model().nodes.slice(0, 95) }), /exactly 96/);
  const duplicate = [...model().nodes];
  duplicate[95] = duplicate[0];
  assert.throws(() => validate96NodeTopology({ ...model(), nodes: duplicate }), /not unique/);
});

test("C1 deterministic replay compares every raw state hash", () => {
  const result = replayDeterministic({
    initialState: model().initialState,
    parameters: { gain: 2 },
    steps: 4,
    step: (state, parameters) => ({ values: state.values.map((x) => x + Number(parameters.gain)) }),
  });
  assert.equal(result.deterministic, true);
  assert.equal(result.trajectory_hashes.length, 5);
});

test("C1 rejects a non-deterministic transition", () => {
  assert.throws(() => replayDeterministic({
    initialState: model().initialState,
    parameters: {},
    steps: 1,
    step: () => ({ values: Array.from({ length: 96 }, () => Math.random()) }),
  }), /deterministic replay failed/);
});

test("C3 parameter matrix is deterministic and complete", () => {
  const rows = parameterMatrix({ beta: [10, 20], alpha: [1, 2, 3] });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], { alpha: 1, beta: 10 });
  assert.deepEqual(rows[5], { alpha: 3, beta: 20 });
});

test("E0 records unperturbed raw trajectory plus provenance fields", () => {
  const m = model();
  const record = runE0Baseline({
    experimentId: "E0-TEST-001",
    model: m,
    seed: "seed-0",
    implementationId: "gpt-96node",
    provenance: { provider: "GPT", run: "independent-96node" },
    steps: 3,
    step: (state) => ({ values: state.values.map((x) => x + 1) }),
    measure: (state) => ({ sum: state.values.reduce((a, b) => a + b, 0) }),
  });
  assert.equal(record.implementation_id, "gpt-96node");
  assert.deepEqual(record.provenance, { provider: "GPT", run: "independent-96node" });
  assert.equal(record.perturbation, null);
  assert.equal(record.raw_trajectory.length, 4);
  assert.equal(record.final_state.values[0], 3);
  assert.equal(record.derived_measurements.sum, 288);
  assert.equal(experimentFingerprint(record).length, 64);
});


test("96-node model registry keeps implementations and experimental surfaces under one model identity", () => {
  assert.equal(GRAND_THEORY_96_NODE_MODEL.modelId, "96NODE_UNIFIED_PHYSICAL_INFORMATIONAL_COGNITIVE");
  assert.ok(GRAND_THEORY_96_NODE_MODEL.implementations.some((x) => x.id === "gemini-96node"));
  assert.ok(GRAND_THEORY_96_NODE_MODEL.implementations.some((x) => x.id === "gpt-96node"));
  assert.ok(GRAND_THEORY_96_NODE_MODEL.experimentSurfaces.some((x) => x.id === "mirror-projection-chamber"));
  assert.equal(
    GRAND_THEORY_96_NODE_MODEL.experimentSurfaces.find((x) => x.id === "mirror-projection-chamber")?.modelRelation,
    "SAME_MODEL_DIFFERENT_EXPERIMENT",
  );
});

test("historical layered trajectory is evidence from the same model, not a different model", () => {
  const traj = GRAND_THEORY_96_NODE_MODEL.implementations.find((x) => x.id === "layered-metrics-csv");
  assert.equal(traj?.kind, "HISTORICAL_EXPERIMENTAL_TRAJECTORY");
  assert.equal(traj?.modelRelation, "SAME_MODEL_INDEPENDENT_IMPLEMENTATION");
  assert.equal(traj?.rawNodeStatesAvailable, false);
  assert.equal(traj?.sourceTransitionLawAvailable, false);
});
