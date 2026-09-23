import test from "node:test";
import assert from "node:assert/strict";
import { KNOWLEDGE_CONNECTORS, hashSourceText } from "../src/lib/knowledge/connectors";

test("knowledge layer exposes multiple live connectors",()=>{
  assert.ok(KNOWLEDGE_CONNECTORS.length>=5);
  assert.ok(KNOWLEDGE_CONNECTORS.some(x=>x.id==="huggingface-models"));
  assert.ok(KNOWLEDGE_CONNECTORS.some(x=>x.id==="github"));
});
test("source hashing is deterministic",()=>{
  assert.equal(hashSourceText("mirror"),hashSourceText("mirror"));
});
