import { assertFiniteNumeric, BaseTheory, type TheoryCase, type TheoryMetadata } from "./baseTheory";
import { aggregateMetrics, compareNumeric, type AggregateMetrics, type CaseMetrics } from "./metrics";

export type StabilityTier = {
  tier: "TIER-1" | "TIER-2" | "TIER-3" | "UNSTABLE" | "FAILED";
  label: "Gold Standard Tier-1" | "Silver Standard Tier-2" | "Experimental Tier-3" | "Unstable" | "Failed";
  reason: string;
};

export type TheoryCaseResult = {
  id: string;
  label?: string;
  input: TheoryCase["input"];
  expected: TheoryCase["expected"];
  predicted?: unknown;
  metrics?: CaseMetrics;
  runtimeMs: number;
  ok: boolean;
  error?: string;
};

export type TheoryRunResult = {
  runId: string;
  theory: TheoryMetadata;
  metrics: AggregateMetrics;
  stability: StabilityTier;
  cases: TheoryCaseResult[];
};

export function classifyStability(metrics: AggregateMetrics): StabilityTier {
  if (!metrics.sampleCount || metrics.failedCount > 0 || !metrics.finite) return { tier: "FAILED", label: "Failed", reason: "The run contains failed or non-finite cases." };
  if ((metrics.rmse ?? Infinity) <= 1e-10 && (metrics.maxAbsoluteDeviation ?? Infinity) <= 1e-9) return { tier: "TIER-1", label: "Gold Standard Tier-1", reason: "All tested cases are finite and numerical error is effectively at floating-point zero." };
  if ((metrics.rmse ?? Infinity) <= 1e-6 && (metrics.maxAbsoluteDeviation ?? Infinity) <= 1e-5) return { tier: "TIER-2", label: "Silver Standard Tier-2", reason: "Low numerical error across the tested cases, but not within the Tier-1 threshold." };
  if ((metrics.rmse ?? Infinity) <= 1e-3 && (metrics.maxAbsoluteDeviation ?? Infinity) <= 1e-2) return { tier: "TIER-3", label: "Experimental Tier-3", reason: "The model is numerically usable for experimentation but requires further validation." };
  return { tier: "UNSTABLE", label: "Unstable", reason: "Observed error exceeds the laboratory stability thresholds." };
}

export async function evaluateTheory(theory: BaseTheory, cases: TheoryCase[], runId: string): Promise<TheoryRunResult> {
  if (!cases.length) throw new Error("At least one test case is required.");
  const results: TheoryCaseResult[] = [];

  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    const id = testCase.id || \`case-\${index + 1}\`;
    const started = performance.now();
    try {
      await theory.validate(testCase.input);
      const predicted = await theory.evaluate(testCase.input, { runId, caseId: id });
      assertFiniteNumeric(predicted);
      const metrics = compareNumeric(testCase.expected, predicted);
      results.push({ id, label: testCase.label, input: testCase.input, expected: testCase.expected, predicted, metrics, runtimeMs: performance.now() - started, ok: true });
    } catch (error: any) {
      results.push({ id, label: testCase.label, input: testCase.input, expected: testCase.expected, runtimeMs: performance.now() - started, ok: false, error: error?.message || String(error) });
    }
  }

  const metricCases = results.map((result) => ({
    ...(result.metrics || { absoluteDeviation: Infinity, squaredError: Infinity, relativeError: null, expectedNorm: 0, predictedNorm: 0 }),
    runtimeMs: result.runtimeMs,
    failed: !result.ok,
  }));

  const metrics = aggregateMetrics(metricCases);
  return { runId, theory: theory.metadata, metrics, stability: classifyStability(metrics), cases: results };
}
