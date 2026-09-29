import test from "node:test";
import assert from "node:assert/strict";
import { step96RelationalCore } from "../src/lib/experimentalLab/unified96Transition";
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


test("reference 96-node transition updates all nodes synchronously from the same prior state", () => {
  const nodes = new Float64Array(96);
  nodes[1] = 10;
  nodes[2] = 20;
  const state = { nodes };
  const weights = new Map([
    ["0->1", 1],
    ["1->0", 1],
    ["1->2", 1],
    ["2->1", 1],
  ]);
  const next = step96RelationalCore(state, { dt: 0.1, weights });
  assert.deepEqual(Array.from(next.nodes), [1, 10, 19]);
  assert.equal(next.nodes.reduce((a, b) => a + b, 0), 30);
});

test("reference relational core preserves the node-count invariant", () => {
  assert.throws(
    () => step96RelationalCore(
      { nodes: Float64Array.from([0, 1]) },
      { dt: 0.1, nodeCount: 96, weights: new Map() },
    ),
    /expected 96 nodes/,
  );
});


test("carrier-native 96-node transition is based on q=phi and p=kappa h", () => {
  const { stepCarrierNative96, hamiltonian96 } = require("../src/lib/experimentalLab/unified96Transition");
  const q = new Float64Array(96);
  const p = new Float64Array(96);
  q[0] = 1e-3;
  const state = { q, p };
  const next = stepCarrierNative96(state, { dt: 1e-3, kappa: 1, b: 2.5 });
  assert.equal(next.q.length, 96);
  assert.equal(next.p.length, 96);
  assert.equal(hamiltonian96(next, { kappa: 1, b: 2.5 }) >= 0, true);
});

test("carrier-native nonlinear phase force is invariant under global phase shift", () => {
  const { stepCarrierNative96 } = require("../src/lib/experimentalLab/unified96Transition");
  const q = Float64Array.from({ length: 96 }, (_, i) => Math.sin(i / 7));
  const p = Float64Array.from({ length: 96 }, (_, i) => 0.01 * Math.cos(i / 11));
  const shifted = {
    q: Float64Array.from(q, (x) => x + 1.2345),
    p: p.slice(),
  };
  const a = stepCarrierNative96({ q, p }, { dt: 1e-3, kappa: 1, b: 2.5 });
  const c2 = stepCarrierNative96(shifted, { dt: 1e-3, kappa: 1, b: 2.5 });
  for (let i = 0; i < 96; i += 1) {
    assert.ok(Math.abs((c2.q[i] - a.q[i]) - 1.2345) < 1e-14);
    assert.ok(Math.abs(c2.p[i] - a.p[i]) < 1e-14);
  }
});

test("carrier-native transition is time-reversible under momentum reversal", () => {
  const { stepCarrierNative96 } = require("../src/lib/experimentalLab/unified96Transition");
  const q0 = Float64Array.from({ length: 96 }, (_, i) => 0.03 * Math.sin(i / 9));
  const p0 = Float64Array.from({ length: 96 }, (_, i) => 0.02 * Math.cos(i / 13));
  let state = { q: q0, p: p0 };
  for (let i = 0; i < 1000; i += 1) {
    state = stepCarrierNative96(state, { dt: 1e-3, kappa: 1, b: 2.5 });
  }
  state = { q: state.q, p: Float64Array.from(state.p, (x) => -x) };
  for (let i = 0; i < 1000; i += 1) {
    state = stepCarrierNative96(state, { dt: 1e-3, kappa: 1, b: 2.5 });
  }
  let maxError = 0;
  for (let i = 0; i < 96; i += 1) {
    maxError = Math.max(maxError, Math.abs(state.q[i] - q0[i]), Math.abs(state.p[i] + p0[i]));
  }
  assert.ok(maxError < 1e-12, `time-reversal error ${maxError}`);
});
