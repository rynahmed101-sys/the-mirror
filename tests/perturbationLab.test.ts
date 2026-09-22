import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  createNinetySixNodeState,
  applySparseNodePerturbation,
  auditSparsePerturbation,
  classifyMirrorResponse,
} from "../src/lib/agent/perturbationLab";
import {
  normalizeOllamaApiKey,
  isDirectOllamaCloudUrl,
} from "../src/lib/ai/ollama";
import { resolveExternalActor } from "../src/lib/auth/externalActor";
import { isTemporaryExternalToken } from "../src/lib/auth";


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

test("hosted Vercel runtime defaults Ollama to cloud when mode is unset", () => {
  const { resolveOllamaRuntimeConfig } = require("../src/lib/ai/ollama") as typeof import("../src/lib/ai/ollama");
  const cfg = resolveOllamaRuntimeConfig({ VERCEL: "1" });
  assert.equal(cfg.cloud, true);
  assert.equal(cfg.baseUrl, "https://ollama.com/api");
  assert.equal(cfg.defaultModel, "gpt-oss:20b-cloud");
});

test("local development still defaults Ollama to localhost", () => {
  const { resolveOllamaRuntimeConfig } = require("../src/lib/ai/ollama") as typeof import("../src/lib/ai/ollama");
  const cfg = resolveOllamaRuntimeConfig({});
  assert.equal(cfg.cloud, false);
  assert.equal(cfg.baseUrl, "http://localhost:11434/api");
  assert.equal(cfg.defaultModel, "llama3.2");
});

test("Ollama cloud API keys are normalized before Authorization is built", () => {
  assert.equal(
    normalizeOllamaApiKey('  "Bearer ollama-test-key"  '),
    "ollama-test-key",
  );
  assert.equal(normalizeOllamaApiKey("ollama-test-key\n"), "ollama-test-key");
});

test("only ollama.com is treated as direct Ollama Cloud API", () => {
  assert.equal(isDirectOllamaCloudUrl("https://ollama.com/api"), true);
  assert.equal(isDirectOllamaCloudUrl("https://example.internal/api"), false);
  assert.equal(isDirectOllamaCloudUrl("http://localhost:11434/api"), false);
});


test("temporary control tokens are translated into guest external-agent identities", () => {
  assert.deepEqual(resolveExternalActor({ kind: "TEMP_EXTERNAL", tokenId: "abc123" }, undefined), {
    agentId: "agent_guest_abc123",
    mode: "TEMP_EXTERNAL",
  });
  assert.throws(
    () => resolveExternalActor({ kind: "TEMP_EXTERNAL", tokenId: "abc123" }, "mirror-primary"),
    /temporary external token may not select another agent/,
  );
});

test("registered external agents retain ownership of their own identity", () => {
  assert.deepEqual(resolveExternalActor({ kind: "AGENT", agentId: "agent_ext_9" }, undefined), {
    agentId: "agent_ext_9",
    mode: "AGENT",
  });
  assert.throws(
    () => resolveExternalActor({ kind: "AGENT", agentId: "agent_ext_9" }, "mirror-primary"),
    /may only act as its own agent/,
  );
});


test("legacy temporary lab tokens are still recognized as external guests", () => {
  assert.equal(isTemporaryExternalToken({ name: "temporary-lab-access", permissions: "full" }), true);
  assert.equal(isTemporaryExternalToken({ name: "other-control-token", permissions: "full" }), false);
  assert.equal(isTemporaryExternalToken({ name: "new-lab-token", permissions: "external_experiment" }), true);
});
