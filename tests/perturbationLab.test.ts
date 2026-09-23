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
import { buildExternalAgentCapabilities } from "../src/lib/agent/externalCapabilities";
import { normalizeAnalysisText } from "../src/lib/agent/analysisEngine";
import { resolveExperimentRevealSource } from "../src/lib/agent/blindIsolation";

import {
  SIMULATION_LOCK_MAX_AGE_MS,
  isSimulationLockFresh,
  shouldBlockSimulationRun,
} from "../src/lib/agent/simulationRunGuard";


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


test("external agent capability manifest exposes machine actions without exposing admin credentials", () => {
  const manifest = buildExternalAgentCapabilities("https://mirror.example");
  assert.equal(manifest.protocolVersion, "1.0");
  assert.equal(manifest.authentication.registeredAgent.header, "Authorization: Bearer mirror_ak_...");
  assert.equal(manifest.authentication.temporaryGuest.header, "Authorization: Bearer <temporary-token>");
  assert.equal(manifest.authentication.admin.externalAgentsMayUse, false);
  assert.equal(manifest.roleModel.environment, "THE MIRROR is the persistent experimental environment and evidence store.");
  assert.equal(manifest.executionModes.externalAsActor.includes("Mirror tools directly"), true);
  assert.equal(manifest.executionModes.externalAsProvider.includes("Not yet supported"), true);
  assert.ok(manifest.endpoints.some((x) => x.path === "/api/agent/sandbox" && x.method === "POST"));
  assert.ok(manifest.endpoints.some((x) => x.path === "/api/mirror/perturbation-lab" && x.method === "POST"));
  assert.equal(manifest.links.capabilities, "https://mirror.example/api/agent/capabilities");
  assert.equal(manifest.links.manual.includes("/main/docs/EXTERNAL_AI_OPERATIONS_MANUAL.md"), true);
});


test("fresh projection locks block a second suite but stale locks can recover", () => {
  const now = Date.parse("2026-09-23T03:00:00.000Z");
  const fresh = { status: "ACTIVE", acquiredAt: now - 60_000, agentId: "mirror-primary", suiteId: "projection_test" };
  const stale = { status: "ACTIVE", acquiredAt: now - SIMULATION_LOCK_MAX_AGE_MS - 1, agentId: "mirror-primary", suiteId: "projection_stale" };

  assert.equal(isSimulationLockFresh(fresh.acquiredAt, now), true);
  assert.equal(isSimulationLockFresh(stale.acquiredAt, now), false);
  assert.equal(shouldBlockSimulationRun([fresh], now), true);
  assert.equal(shouldBlockSimulationRun([stale], now), false);
  assert.equal(shouldBlockSimulationRun([{ ...fresh, status: "RELEASED" }], now), false);
});


test("structured observation values are normalized before Layer 1 string analysis", () => {
  assert.equal(normalizeAnalysisText("plain text"), "plain text");
  assert.equal(normalizeAnalysisText({ observed: true, values: [1, 2, 3] }), '{"observed":true,"values":[1,2,3]}');
  assert.equal(normalizeAnalysisText(["a", "b"]), '["a","b"]');
  assert.equal(normalizeAnalysisText(null), "");
});

test("experiment reveal provenance follows the actual revealer", () => {
  assert.equal(resolveExperimentRevealSource("SYSTEM"), "SYSTEM");
  assert.equal(resolveExperimentRevealSource("RESEARCHER"), "RESEARCHER");
  assert.equal(resolveExperimentRevealSource("external-agent"), "RESEARCHER");
});
