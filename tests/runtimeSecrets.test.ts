import test from "node:test";
import assert from "node:assert/strict";
import { buildAccessLink } from "../src/lib/agent/accessLinks";

test("runtime configuration never belongs in a client URL or browser storage contract", () => {
  const url = buildAccessLink("https://mirror.example", "ml_abcdefghijklmnop");
  assert.equal(url.includes("ollama"), false);
  assert.equal(url.includes("apiKey"), false);
});
