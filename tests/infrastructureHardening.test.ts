import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAnalysisText } from "../src/lib/agent/analysisEngine";
import { normalizeOllamaApiKey, resolveOllamaRuntimeConfig } from "../src/lib/ai/ollama";
import { resolveExternalActor } from "../src/lib/auth/externalActor";
import { isSimulationLockFresh, shouldBlockSimulationRun } from "../src/lib/agent/simulationRunGuard";

test("analysis normalization never calls string methods on structured values", () => {
  assert.equal(normalizeAnalysisText({ nested: true }), '{"nested":true}');
  assert.equal(normalizeAnalysisText(["a", 1]), '["a",1]');
  assert.equal(normalizeAnalysisText(null), "");
});

test("Ollama key normalization accepts copied bearer keys safely", () => {
  assert.equal(normalizeOllamaApiKey(' Bearer "abc123" '), "abc123");
  assert.equal(normalizeOllamaApiKey("'abc123'"), "abc123");
});

test("hosted Ollama defaults to cloud only on explicit hosted deployment conditions", () => {
  assert.equal(resolveOllamaRuntimeConfig({ OLLAMA_MODE:"cloud" }).cloud, true);
  assert.equal(resolveOllamaRuntimeConfig({ OLLAMA_MODE:"local" }).cloud, false);
});

test("external actors cannot select another agent identity", () => {
  assert.throws(
    () => resolveExternalActor({ kind:"AGENT", agentId:"agent_a" }, "agent_b"),
    /only act as its own agent/
  );
  assert.deepEqual(
    resolveExternalActor({ kind:"AGENT", agentId:"agent_a" }),
    { agentId:"agent_a", mode:"AGENT" }
  );
});

test("simulation guard blocks only fresh active locks", () => {
  const now=1_000_000;
  assert.equal(isSimulationLockFresh(now - 1000, now, 5000), true);
  assert.equal(isSimulationLockFresh(now - 6000, now, 5000), false);
  assert.equal(shouldBlockSimulationRun([{status:"ACTIVE",acquiredAt:now-1000}], now, 5000), true);
  assert.equal(shouldBlockSimulationRun([{status:"ENDED",acquiredAt:now-1000}], now, 5000), false);
});
