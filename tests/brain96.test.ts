import test from "node:test";
import assert from "node:assert/strict";
import { summarizeBrain96, validateBrain96, tendencyLabel } from "../src/lib/lab/brain96";

function fixture() {
  return {
    id: "mirror-brain",
    version: "0.1",
    name: "Mirror 96",
    nodes: Array.from({ length: 96 }, (_, index) => ({
      id: "b" + index,
      label: "Node " + index,
      index,
      hemisphere: tendencyLabel((index % 3) - 1),
      tendency: ((index % 5) - 2) / 2,
    })),
    edges: [{ from: "b0", to: "b1", weight: 1 }],
  };
}

test("brain validator enforces exactly 96 nodes", () => {
  assert.equal(validateBrain96(fixture()).nodes.length, 96);
  assert.throws(() => validateBrain96({ ...fixture(), nodes: fixture().nodes.slice(0, 95) }), /exactly 96/);
});

test("brain summary is deterministic", () => {
  const summary = summarizeBrain96(fixture());
  assert.equal(summary.total, 96);
  assert.equal(summary.edgeCount, 1);
});

test("tendency labels are thresholded and separate from node count", () => {
  assert.equal(tendencyLabel(-0.5), "left");
  assert.equal(tendencyLabel(0), "balanced");
  assert.equal(tendencyLabel(0.5), "right");
});
