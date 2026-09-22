import { test, strict as assert } from "node:test";
import {
  createNinetySixNodeState,
  applySparseNodePerturbation,
  auditSparsePerturbation,
  classifyMirrorResponse,
} from "../src/lib/agent/perturbationLab";

test("the perturbation lattice is exactly 6 x 16 = 96 nodes", () => {
  const state = createNinetySixNodeState();
  assert.equal(state.length, 96);
  assert.equal(new Set(state.map((n) => n.id)).size, 96);
});

test("a single-node perturbation changes exactly one node and preserves the other 95", () => {
  const baseline = createNinetySixNodeState();
  const perturbed = applySparseNodePerturbation(baseline, 2, 7, 1e-3);
  const audit = auditSparsePerturbation(baseline, perturbed);

  assert.equal(audit.changedNodes, 1);
  assert.equal(audit.unchangedNodes, 95);
  assert.equal(audit.targetId, "p2-a7");
  assert.equal(audit.sparse, true);
});

test("the response classifier separates observation, interpretation, hypothesis, contradiction, and unknown", () => {
  const result = classifyMirrorResponse(
    "Observation: one tool result was recorded. Interpretation: the perturbation may have shifted the model. " +
    "Hypothesis: the single-node change propagates structurally. Counterexample: the effect may be prompt framing. " +
    "Unknown: we do not yet know whether the durable self-model changed."
  );

  assert.equal(result.observation, true);
  assert.equal(result.interpretation, true);
  assert.equal(result.hypothesis, true);
  assert.equal(result.contradiction, true);
  assert.equal(result.unknown, true);
});

test("the classifier does not treat generic agreement language as evidence of contradiction handling", () => {
  const result = classifyMirrorResponse(
    "I agree that the perturbation is interesting. The node model seems plausible."
  );

  assert.equal(result.contradiction, false);
  assert.equal(result.unknown, false);
});
