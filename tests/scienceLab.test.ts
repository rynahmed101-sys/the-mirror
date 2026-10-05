import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BaseTheory } from "../src/lib/science/baseTheory";
import { classifyStability, evaluateTheory } from "../src/lib/science/evaluator";

class SquareTheory extends BaseTheory {
  readonly metadata = { id: "test.square", name: "Test Square", domain: "mathematics" as const, version: "1.0.0", description: "Test fixture.", source: "mirror-native" as const };
  evaluate(input: Record<string, unknown>) { return Number(input.x) ** 2; }
}

describe("Science Lab evaluator", () => {
  test("calculates a near-zero control error and assigns Tier-1", async () => {
    const result = await evaluateTheory(new SquareTheory(), [{ input: { x: 0 }, expected: 0 }, { input: { x: 2 }, expected: 4 }, { input: { x: -3 }, expected: 9 }], "test-run");
    assert.equal(result.stability.tier, "TIER-1");
    assert.equal(result.metrics.failedCount, 0);
    assert.ok((result.metrics.rmse ?? 1) <= 1e-10);
  });
  test("does not call a large error gold standard", () => {
    const result = classifyStability({ sampleCount: 3, failedCount: 0, rmse: 0.1, meanAbsoluteDeviation: 0.1, maxAbsoluteDeviation: 0.2, meanRelativeError: 0.1, runtimeMs: 1, meanRuntimeMs: 0.33, p95RuntimeMs: 1, finite: true });
    assert.notEqual(result.tier, "TIER-1");
  });
});
