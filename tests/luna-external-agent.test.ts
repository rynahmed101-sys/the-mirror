import test from "node:test";
import assert from "node:assert/strict";
import { LUNA_EXTERNAL_AGENT } from "../src/lib/auth/lunaExternalAgent";

test("Luna is represented as a persistent external research agent", () => {
  assert.equal(LUNA_EXTERNAL_AGENT.id, "agent_external_gpt56_luna");
  assert.equal(LUNA_EXTERNAL_AGENT.type, "EXTERNAL");
  assert.equal(LUNA_EXTERNAL_AGENT.role, "EXTERNAL_AGENT");
  assert.equal(LUNA_EXTERNAL_AGENT.provider, "external");
  assert.equal(LUNA_EXTERNAL_AGENT.model, "gpt-5.6-luna");
  assert.deepEqual(LUNA_EXTERNAL_AGENT.permissions, ["RESEARCH_AGENT"]);
});
