import test from "node:test";
import assert from "node:assert/strict";
import { buildAccessLink, capabilityRequestUrl } from "../src/lib/agent/accessLinks";

test("access links are link-shaped capabilities, not bearer token strings", () => {
  const url = buildAccessLink("https://mirror.example", "ml_example1234567890");
  assert.equal(url, "https://mirror.example/access/ml_example1234567890");
  assert.match(capabilityRequestUrl("ml_example1234567890", "https://mirror.example"), /^https:\/\/mirror\.example\/access\//);
  assert.doesNotMatch(url, /mirror_ak_|^mirror_[A-Za-z0-9_-]+$/);
});
