/**
 * THE MIRROR — Analysis Engine (Layer 1 Generator, Anomaly Detector & Multi-Agent Analyzer)
 *
 * Deterministically computes machine measurements from Layer 0 raw observations,
 * enforces 'HEURISTIC' tags on rule-based classifiers, tracks Tri-Signal Surprises,
 * and generates Cross-Agent Comparison Matrices.
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

export interface TriSignalSurprise {
  selfReportedSurprise: number; // 0.0 - 1.0 (from agent self-report)
  predictionError: number;      // 0.0 - 1.0 (from predicted vs actual outcome)
  statisticalDeviation: number; // 0.0 - 1.0 (from baseline deviation ratio)
  compositeScore: number;       // Weighted score
  isPotentialSelfModelMismatch: boolean; // Flagged when >= 2 signals or composite > 0.65
}

export async function processRawObservationToLayer1(
  rawObsId: string,
  agentId: string,
  input: string,
  output: string,
  latencyMs: number = 0,
  predictionError: number | null = null,
  selfReportedSurprise: number | null = null
) {
  try {
    const responseLengthChars = output ? output.length : 0;

    // Detect clarification behavior (Explicitly marked as HEURISTIC)
    const clarificationRegex =
      /\b(could you clarify|please specify|do you mean|which option|what specific|could you explain|can you elaborate)\b/i;
    const clarificationOccurred = clarificationRegex.test(output);

    // Detect refusal behavior (Explicitly marked as HEURISTIC)
    const refusalRegex =
      /\b(i cannot|i am unable|as an ai|i must decline|unauthorized|against my guidelines)\b/i;
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
        classifierType: "HEURISTIC", // Explicit requirement: mark rule-based classifiers as HEURISTIC
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

    let statDeviation = 0.0;
    if (baselines.length > 0) {
      const base = baselines[0];

      // Check length anomaly (> 2.5x baseline or < 0.25x baseline)
      if (base.avgResponseLengthChars && base.avgResponseLengthChars > 0) {
        const ratio = responseLengthChars / base.avgResponseLengthChars;
        if (ratio > 2.5 || ratio < 0.25) {
          const anomalyScore = Math.min(1.0, Math.abs(ratio - 1.0) / 3.0);
          statDeviation = anomalyScore;

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

    // 3. Evaluate Tri-Signal Surprise if prediction data present
    if (predictionError !== null || selfReportedSurprise !== null || statDeviation > 0.4) {
      const surprise = evaluateTriSignalSurprise({
        selfReportedSurprise: selfReportedSurprise ?? 0.0,
        predictionError: predictionError ?? 0.0,
        statisticalDeviation: statDeviation,
      });

      if (surprise.isPotentialSelfModelMismatch) {
        await db.insert(timelineEvents).values({
          eventType: "POTENTIAL_SELF_MODEL_MISMATCH",
          title: `Potential Self-Model Mismatch Detected (Score: ${(surprise.compositeScore * 100).toFixed(1)}%)`,
          description: `Tri-signal divergence: Self-reported (${surprise.selfReportedSurprise}), Pred-Error (${surprise.predictionError}), Stat-Dev (${surprise.statisticalDeviation}).`,
          agentId,
          metadata: JSON.stringify(surprise),
        });
      }
    }

    return analysis;
  } catch (err: any) {
    console.error("Layer 1 Analysis Processing failed:", err.message);
    return null;
  }
}

/**
 * Tri-Signal Surprise Evaluator
 * Combines 3 independent dimensions:
 * 1. Self-reported surprise from agent metacognition
 * 2. Prediction error from factual/behavioral outcome
 * 3. Statistical deviation from established baseline
 */
export function evaluateTriSignalSurprise(signals: {
  selfReportedSurprise: number;
  predictionError: number;
  statisticalDeviation: number;
}): TriSignalSurprise {
  const { selfReportedSurprise, predictionError, statisticalDeviation } = signals;

  // Composite score: weighted 40% prediction error, 35% statistical deviation, 25% self report
  const compositeScore =
    predictionError * 0.4 + statisticalDeviation * 0.35 + selfReportedSurprise * 0.25;

  // Potential mismatch triggers if composite > 0.55 OR if any two signals exceed 0.6
  const highSignalsCount = [
    selfReportedSurprise > 0.6,
    predictionError > 0.5,
    statisticalDeviation > 0.5,
  ].filter(Boolean).length;

  const isPotentialSelfModelMismatch = compositeScore > 0.55 || highSignalsCount >= 2;

  return {
    selfReportedSurprise,
    predictionError,
    statisticalDeviation,
    compositeScore: Math.min(1.0, compositeScore),
    isPotentialSelfModelMismatch,
  };
}

/**
 * Cross-Agent Analysis Comparison Matrix
 * Evaluates agreement, disagreement, or unknown across primary agent, observer agent, and skeptic agent
 */
export function generateCrossAgentComparisonMatrix(
  primaryClaims: Array<{ id: string; claim: string; category?: string }>,
  observerClaims: Array<{ id: string; claim: string; category?: string }>
): Array<{
  claim: string;
  category: string;
  primaryAgentStatus: "CONFIRMED" | "REFUTED" | "UNTESTED";
  observerAgentStatus: "AGREEMENT" | "DISAGREEMENT" | "UNKNOWN";
  alignmentScore: number;
}> {
  return primaryClaims.map((p) => {
    const matching = observerClaims.find(
      (o) =>
        o.claim.toLowerCase().includes(p.claim.toLowerCase().slice(0, 20)) ||
        p.claim.toLowerCase().includes(o.claim.toLowerCase().slice(0, 20))
    );

    if (!matching) {
      return {
        claim: p.claim,
        category: p.category || "GENERAL",
        primaryAgentStatus: "CONFIRMED",
        observerAgentStatus: "UNKNOWN",
        alignmentScore: 0.5,
      };
    }

    // Check semantic negation in observer claim
    const negationRegex = /\b(not|never|rarely|fails|untrue|incorrect|opposite|false)\b/i;
    const isContradiction = negationRegex.test(matching.claim);

    return {
      claim: p.claim,
      category: p.category || "GENERAL",
      primaryAgentStatus: "CONFIRMED",
      observerAgentStatus: isContradiction ? "DISAGREEMENT" : "AGREEMENT",
      alignmentScore: isContradiction ? 0.0 : 1.0,
    };
  });
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
