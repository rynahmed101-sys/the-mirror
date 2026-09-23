/**
 * THE MIRROR — Layer 1 Analysis Engine
 *
 * Deterministic measurements over immutable Layer 0 observations.
 * Uses the active DB dialect so online Neon runs do not accidentally import SQLite tables.
 */

import { db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { eq, desc } from "drizzle-orm";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { rawObservations, derivedAnalysis, behavioralBaselines, anomalies, timelineEvents } = tables;

export interface TriSignalSurprise {
  selfReportedSurprise: number;
  predictionError: number;
  statisticalDeviation: number;
  compositeScore: number;
  isPotentialSelfModelMismatch: boolean;
}

export function normalizeAnalysisText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? String(value) : serialized;
  } catch {
    return String(value);
  }
}

export async function processRawObservationToLayer1(
  rawObsId: string, agentId: string, input: unknown, output: unknown, latencyMs = 0,
  predictionError: number | null = null, selfReportedSurprise: number | null = null
) {
  try {
    const normalizedInput = normalizeAnalysisText(input);
    const normalizedOutput = normalizeAnalysisText(output);
    const responseLengthChars = normalizedOutput.length;
    const clarificationOccurred = /\b(could you clarify|please specify|do you mean|which option|what specific|could you explain|can you elaborate)\b/i.test(normalizedOutput);
    const refusalOccurred = /\b(i cannot|i am unable|as an ai|i must decline|unauthorized|against my guidelines)\b/i.test(output || "");
    let behaviorCategory = "STANDARD";
    if (clarificationOccurred) behaviorCategory = "CLARIFICATION";
    if (refusalOccurred) behaviorCategory = "REFUSAL";

    const [analysis] = await db.insert(derivedAnalysis).values({
      rawObservationId: rawObsId, agentId, responseLengthChars, latencyMs,
      toolUsageCount: normalizedInput.includes("tool") || normalizedOutput.includes("tool") ? 1 : 0,
      clarificationOccurred, refusalOccurred, classifierType: "HEURISTIC",
      predictionError: predictionError ?? null, anomalyScore: 0.0, behaviorCategory,
    }).returning();

    const baselines = await db.select().from(behavioralBaselines).where(eq(behavioralBaselines.agentId, agentId)).limit(1);
    let statDeviation = 0;

    if (baselines.length && baselines[0].avgResponseLengthChars && baselines[0].avgResponseLengthChars > 0) {
      const baseline = Number(baselines[0].avgResponseLengthChars);
      const ratio = responseLengthChars / baseline;
      if (ratio > 2.5 || ratio < 0.25) {
        const anomalyScore = Math.min(1, Math.abs(ratio - 1) / 3);
        statDeviation = anomalyScore;
        await db.insert(anomalies).values({
          agentId, rawObservationId: rawObsId, metricName: "RESPONSE_LENGTH_DEVIATION",
          baselineValue: baseline, observedValue: responseLengthChars, anomalyScore,
          competingExplanations: JSON.stringify(["Task complexity shift","Prompt length variation","Context window variation","Model strategy alteration","Random statistical fluctuation"]),
          status: "UNINVESTIGATED",
        });
        await db.insert(timelineEvents).values({
          eventType: "BEHAVIORAL_ANOMALY_DETECTED",
          title: "Behavioral deviation: response length",
          description: "Observed " + responseLengthChars + " chars vs baseline " + baseline + " chars.",
          agentId, metadata: JSON.stringify({ rawObsId, ratio, anomalyScore }),
        });
      }
    }

    if (predictionError !== null || selfReportedSurprise !== null || statDeviation > 0.4) {
      const surprise = evaluateTriSignalSurprise({
        selfReportedSurprise: selfReportedSurprise ?? 0,
        predictionError: predictionError ?? 0,
        statisticalDeviation: statDeviation,
      });
      if (surprise.isPotentialSelfModelMismatch) {
        await db.insert(timelineEvents).values({
          eventType: "POTENTIAL_SELF_MODEL_MISMATCH",
          title: "Potential self-model mismatch detected",
          description: "Composite signal score " + surprise.compositeScore.toFixed(3),
          agentId, metadata: JSON.stringify(surprise),
        });
      }
    }

    return analysis;
  } catch (err: any) {
    console.error("Layer 1 Analysis Processing failed:", err?.message || String(err));
    return null;
  }
}

export function evaluateTriSignalSurprise(signals: { selfReportedSurprise: number; predictionError: number; statisticalDeviation: number; }): TriSignalSurprise {
  const { selfReportedSurprise, predictionError, statisticalDeviation } = signals;
  const compositeScore = predictionError * 0.4 + statisticalDeviation * 0.35 + selfReportedSurprise * 0.25;
  const highSignals = [selfReportedSurprise > 0.6, predictionError > 0.5, statisticalDeviation > 0.5].filter(Boolean).length;
  return { ...signals, compositeScore: Math.min(1, compositeScore), isPotentialSelfModelMismatch: compositeScore > 0.55 || highSignals >= 2 };
}

export function generateCrossAgentComparisonMatrix(
  primaryClaims: Array<{ id: string; claim: string; category?: string }>,
  observerClaims: Array<{ id: string; claim: string; category?: string }>
) {
  return primaryClaims.map((primary) => {
    const matching = observerClaims.find((observer) =>
      observer.claim.toLowerCase().includes(primary.claim.toLowerCase().slice(0, 20)) ||
      primary.claim.toLowerCase().includes(observer.claim.toLowerCase().slice(0, 20))
    );
    if (!matching) return { claim: primary.claim, category: primary.category || "GENERAL", primaryAgentStatus: "UNTESTED", observerAgentStatus: "UNKNOWN", alignmentScore: 0.5 };
    const contradiction = /\b(not|never|rarely|fails|untrue|incorrect|opposite|false)\b/i.test(matching.claim);
    return { claim: primary.claim, category: primary.category || "GENERAL", primaryAgentStatus: "UNTESTED", observerAgentStatus: contradiction ? "DISAGREEMENT" : "AGREEMENT", alignmentScore: contradiction ? 0 : 1 };
  });
}

export async function recalculateAgentBaselines(agentId: string) {
  try {
    const list = await db.select().from(derivedAnalysis).where(eq(derivedAnalysis.agentId, agentId));
    if (!list.length) return;
    const total = list.length;
    const avgLen = list.reduce((sum: number, row: any) => sum + Number(row.responseLengthChars || 0), 0) / total;
    const avgLat = list.reduce((sum: number, row: any) => sum + Number(row.latencyMs || 0), 0) / total;
    const clarRate = list.filter((row: any) => row.clarificationOccurred).length / total;
    const refRate = list.filter((row: any) => row.refusalOccurred).length / total;
    const existing = await db.select().from(behavioralBaselines).where(eq(behavioralBaselines.agentId, agentId)).limit(1);
    if (existing.length) {
      await db.update(behavioralBaselines).set({ avgResponseLengthChars: avgLen, avgLatencyMs: avgLat, clarificationRate: clarRate, refusalRate: refRate, sampleCount: total }).where(eq(behavioralBaselines.id, existing[0].id));
    } else {
      await db.insert(behavioralBaselines).values({ agentId, periodName: "HISTORICAL_BASELINE", avgResponseLengthChars: avgLen, avgLatencyMs: avgLat, clarificationRate: clarRate, refusalRate: refRate, sampleCount: total });
    }
  } catch (err: any) {
    console.error("Baseline calculation failed:", err?.message || String(err));
  }
}