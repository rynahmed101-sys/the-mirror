import type { NumericValue } from "./baseTheory";

export type CaseMetrics = {
  absoluteDeviation: number;
  squaredError: number;
  relativeError: number | null;
  expectedNorm: number;
  predictedNorm: number;
};

export type AggregateMetrics = {
  sampleCount: number;
  failedCount: number;
  rmse: number | null;
  meanAbsoluteDeviation: number | null;
  maxAbsoluteDeviation: number | null;
  meanRelativeError: number | null;
  runtimeMs: number;
  meanRuntimeMs: number;
  p95RuntimeMs: number;
  finite: boolean;
};

function flatten(value: NumericValue): number[] {
  return Array.isArray(value) ? value : [value];
}

function norm(values: number[]) {
  return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
}

export function compareNumeric(expected: NumericValue, predicted: NumericValue): CaseMetrics {
  const e = flatten(expected);
  const p = flatten(predicted);
  if (e.length !== p.length) throw new Error(\`Shape mismatch: expected \${e.length} value(s), received \${p.length}.\`);

  const errors = e.map((x, i) => Math.abs(x - p[i]));
  const squared = errors.reduce((sum, x) => sum + x * x, 0) / errors.length;
  const expectedNorm = norm(e);
  const predictedNorm = norm(p);
  const absoluteDeviation = errors.reduce((a, b) => a + b, 0) / errors.length;
  const relativeError = expectedNorm === 0 ? (predictedNorm === 0 ? 0 : null) : norm(e.map((x, i) => x - p[i])) / expectedNorm;

  return { absoluteDeviation, squaredError: squared, relativeError, expectedNorm, predictedNorm };
}

export function aggregateMetrics(cases: Array<CaseMetrics & { runtimeMs: number; failed?: boolean }>): AggregateMetrics {
  const successful = cases.filter((x) => !x.failed && Number.isFinite(x.squaredError));
  const runtimes = successful.map((x) => x.runtimeMs).sort((a, b) => a - b);
  const rmse = successful.length ? Math.sqrt(successful.reduce((sum, x) => sum + x.squaredError, 0) / successful.length) : null;
  const meanAbsoluteDeviation = successful.length ? successful.reduce((sum, x) => sum + x.absoluteDeviation, 0) / successful.length : null;
  const relative = successful.map((x) => x.relativeError).filter((x): x is number => x !== null && Number.isFinite(x));
  const meanRelativeError = relative.length ? relative.reduce((a, b) => a + b, 0) / relative.length : null;
  const p95Index = runtimes.length ? Math.min(runtimes.length - 1, Math.ceil(runtimes.length * 0.95) - 1) : 0;

  return {
    sampleCount: cases.length,
    failedCount: cases.length - successful.length,
    rmse,
    meanAbsoluteDeviation,
    maxAbsoluteDeviation: successful.length ? Math.max(...successful.map((x) => x.absoluteDeviation)) : null,
    meanRelativeError,
    runtimeMs: runtimes.reduce((a, b) => a + b, 0),
    meanRuntimeMs: runtimes.length ? runtimes.reduce((a, b) => a + b, 0) / runtimes.length : 0,
    p95RuntimeMs: runtimes[p95Index] ?? 0,
    finite: successful.length === cases.length,
  };
}
