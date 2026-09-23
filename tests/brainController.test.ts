import { strict as assert } from "node:assert";
import test from "node:test";
import { createOperationalBrain96 } from "../src/lib/lab/brain96";

test("operational brain has 96 bilateral controller nodes",()=>{
  const brain=createOperationalBrain96();
  assert.equal(brain.nodes.length,96);
  assert.equal(brain.nodes.filter(n=>n.hemisphere==="left").length,48);
  assert.equal(brain.nodes.filter(n=>n.hemisphere==="right").length,48);
  assert.ok(brain.edges.length>96);
});

test("behavioral columns are unique across 16 functions",()=>{
  const brain=createOperationalBrain96();
  const cols=new Set(brain.nodes.map(n=>n.column));
  assert.equal(cols.size,16);
  assert.ok(brain.nodes.every(n=>n.metadata?.causalStatus==="UNTESTED_PER_NODE"));
});
