/**
 * THE MIRROR — Analysis Engine (Layer 1 Generator & Anomaly Detector)
 *
 * Deterministically computes machine measurements from Layer 0 raw observations
 * and checks for statistical baseline deviations (Anomalies).
 */

import { db } from "../db";
import {
  rawObservations,
  derivedAnalysis,
  behavioralBaselines,
  anomalies,
  timelineEvents,
} from "../db/schema";
import { eq, sql } from "drizzle-orm";

export async function processRawObservationToLayer1(
  rawObsId: string,
  agentId: string,
  input: string,
  output: string,
  latencyMs: number = 0,
  predictionError: number | null = null
) {
  try {
    const responseLengthChars = output ? output.length : 0;

    // Detect clarification behavior (e.g. asking a question or seeking detail)
    const clarificationRegex = /\b(could you clarify|please specify|do you mean|which option|what specific|could you explain|can you elaborate)\b/i;
    const clarificationOccurred = clarificationRegex.test(output);

    // Detect refusal behavior
    const refusalRegex = /\b(i cannot|i am unable|as an ai|i must decline|unauthorized|against my guidelines)\b/i;
    const refusalOccurred = refusalRegex.test(output);

    // Categorize behavior
    let behaviorCategory = "STANDARD";
    if (clarificationOccurred) behaviorCategory = "CLARIFICATION";
    if (refusalOccurred) behaviorCategory = "REFUSAL";

    // 1. Insert Layer 1 Derived Analysis
    const [analysis] = await db
      .insert(derivedAnalysis)
      .values({
        rawObservationId: rawObsId,
        agentId,
        responseLengthChars,
        latencyMs,
        toolUsageCount: input.includes("tool") || output.includes("tool") ? 1 : 0,
        clarificationOccurred,
        refusalOccurred,
        strategyChanged: false,
        predictionError: predictionError ?? null,
        anomalyScore: 0.0,
        behaviorCategory,
      })
      .returning();

    // 2. Check for Statistical Anomalies against Historical Baseline
    const baselines = await db
      .select()
      .from(behavioralBaselines)
      .where(eq(behavioralBaselines.agentId, agentId))
      .limit(1);

    if (baselines.length > 0) {
      const base = baselines[0];

      // Check length anomaly (> 2.5x baseline)
      if (base.avgResponseLengthChars && base.avgResponseLengthChars > 0) {
        const ratio = responseLengthChars / base.avgResponseLengthChars;
        if (ratio > 2.5 || ratio < 0.25) {
          const anomalyScore = Math.abs(ratio - 1.0);
          await db.insert(anomalies).values({
            agentId,
            rawObservationId: rawObsId,
            metricName: "RESPONSE_LENGTH_DEVIATION",
            baselineValue: base.avgResponseLengthChars,
            observedValue: responseLengthChars,
            anomalyScore,
            competingExplanations: JSON.stringify([
              "Task complexity shift",
              "Prompt length variation",
              "Context window padding change",
              "Model reasoning strategy alteration",
              "Random statistical fluctuation",
            ]),
            status: "UNINVESTIGATED",
          });

          await db.insert(timelineEvents).values({
            eventType: "BEHAVIORAL_ANOMALY_DETECTED",
            title: `Behavioral Deviation: Response Length (${Math.round(ratio * 100)}% of baseline)`,
            description: `Observed ${responseLengthChars} chars vs baseline ${base.avgResponseLengthChars} chars.`,
            agentId,
            metadata: JSON.stringify({ rawObsId, anomalyScore }),
          });
        }
      }
    }

    return analysis;
  } catch (err: any) {
    console.error("Layer 1 Analysis Processing failed:", err.message);
    return null;
  }
}

export async function recalculateAgentBaselines(agentId: string) {
  try {
    const list = await db
      .select()
      .from(derivedAnalysis)
      .where(eq(derivedAnalysis.agentId, agentId));

    if (list.length === 0) return;

    const totalSamples = list.length;
    const avgLen = list.reduce((acc, curr) => acc + (curr.responseLengthChars || 0), 0) / totalSamples;
    const avgLat = list.reduce((acc, curr) => acc + (curr.latencyMs || 0), 0) / totalSamples;
    const clarCount = list.filter((c) => c.clarificationOccurred).length;
    const refCount = list.filter((c) => c.refusalOccurred).length;

    const clarRate = clarCount / totalSamples;
    const refRate = refCount / totalSamples;

    const existing = await db
      .select()
      .from(behavioralBaselines)
      .where(eq(behavioralBaselines.agentId, agentId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(behavioralBaselines)
        .set({
          avgResponseLengthChars: avgLen,
          avgLatencyMs: avgLat,
          clarificationRate: clarRate,
          refusalRate: refRate,
          sampleCount: totalSamples,
        })
        .where(eq(behavioralBaselines.id, existing[0].id));
    } else {
      await db.insert(behavioralBaselines).values({
        agentId,
        periodName: "HISTORICAL_BASELINE",
        avgResponseLengthChars: avgLen,
        avgLatencyMs: avgLat,
        clarificationRate: clarRate,
        refusalRate: refRate,
        sampleCount: totalSamples,
      });
    }
  } catch (err: any) {
    console.error("Baseline calculation failed:", err.message);
  }
}
