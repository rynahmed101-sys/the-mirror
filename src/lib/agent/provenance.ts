/**
 * THE MIRROR — Authoritative Provenance Lineage Engine
 *
 * Strict 7-Stage Provenance Chain:
 * Experiment → Prediction → Action → Raw Event → Analysis → Observation → Interpretation
 *
 * Core Research Integrity Invariant:
 * Whenever the system states "this happened", the underlying evidence MUST
 * ultimately resolve to RAW EVENT LEDGER records.
 * Summaries, self-model statements, and interpretations are never treated as raw evidence.
 *
 * Blind Experiment Rule:
 * Hidden configuration is strictly redacted from provenance output until explicit reveal.
 */

import { sqlite } from "../db";
import { filterExperimentForAgent } from "./blindIsolation";

export interface StageProvenanceTrace {
  targetId: string;
  targetType: "CLAIM" | "EXPERIMENT" | "PREDICTION";
  lineage: {
    experiment: any | null;
    prediction: any | null;
    action: any | null;
    rawEvent: any | null;
    analysis: any | null;
    observation: any | null;
    interpretation: any | null;
  };
  stages: Array<{
    stageNumber: number;
    layer: string;
    entityType: string;
    id: string;
    authoritative: boolean;
    summary: string;
    details: any;
  }>;
  rawEvidenceHash: string | null;
  rawEventSequence: number | null;
  isBlindRestricted: boolean;
}

export async function getProvenanceTrace(
  identifier: string,
  requestingAgentId: string = "mirror-primary"
): Promise<StageProvenanceTrace | null> {
  try {
    // 1. Try finding by self_model_claims (Interpretation Layer)
    const claim = sqlite
      .prepare(`SELECT * FROM self_model_claims WHERE id = ?`)
      .get(identifier) as any | undefined;

    let experimentId: string | null = null;
    let predictionId: string | null = null;
    let rawEventId: string | null = null;
    let observationId: string | null = null;

    if (claim) {
      // Parse supporting evidence
      let evidenceIds: string[] = [];
      try {
        evidenceIds = claim.supporting_evidence ? JSON.parse(claim.supporting_evidence) : [];
      } catch {
        evidenceIds = [];
      }

      if (evidenceIds.length > 0) {
        observationId = evidenceIds[0];
      }
    }

    // 2. Try finding by experiments
    const exp = sqlite
      .prepare(`SELECT * FROM experiments WHERE id = ?`)
      .get(identifier) as any | undefined;

    if (exp) {
      experimentId = exp.id;
    }

    // 3. Try finding by predictions
    const pred = sqlite
      .prepare(`SELECT * FROM predictions WHERE id = ?`)
      .get(identifier) as any | undefined;

    if (pred) {
      predictionId = pred.id;
      if (pred.experiment_id) experimentId = pred.experiment_id;
    }

    // Resolve Experiment
    let experimentRecord: any = null;
    if (experimentId) {
      const rawExp = sqlite
        .prepare(`SELECT * FROM experiments WHERE id = ?`)
        .get(experimentId) as any | undefined;
      if (rawExp) {
        experimentRecord = filterExperimentForAgent(rawExp, requestingAgentId);
      }
    }

    // Resolve Prediction
    let predictionRecord: any = null;
    if (predictionId) {
      predictionRecord = sqlite
        .prepare(`SELECT * FROM predictions WHERE id = ?`)
        .get(predictionId);
    } else if (experimentId) {
      predictionRecord = sqlite
        .prepare(`SELECT * FROM predictions WHERE experiment_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(experimentId);
    }

    // Resolve Observation
    let observationRecord: any = null;
    if (observationId) {
      observationRecord = sqlite
        .prepare(`SELECT * FROM behavioral_observations WHERE id = ?`)
        .get(observationId);
    } else if (experimentId) {
      observationRecord = sqlite
        .prepare(`SELECT * FROM behavioral_observations WHERE experiment_id = ? ORDER BY created_at DESC LIMIT 1`)
        .get(experimentId);
    }

    // Resolve Action (Tool Log)
    let actionRecord: any = null;
    if (experimentId) {
      actionRecord = sqlite
        .prepare(
          `SELECT * FROM tool_logs 
           WHERE request_id IN (
             SELECT request_id FROM raw_event_ledger WHERE experiment_id = ?
           )
           LIMIT 1`
        )
        .get(experimentId);
    }
    if (!actionRecord) {
      actionRecord = sqlite
        .prepare(`SELECT * FROM tool_logs ORDER BY created_at DESC LIMIT 1`)
        .get();
    }

    // Resolve Raw Event (AUTHORITATIVE Layer 0)
    let rawEventRecord: any = null;
    if (actionRecord?.request_id) {
      rawEventRecord = sqlite
        .prepare(
          `SELECT * FROM raw_event_ledger 
           WHERE request_id = ? 
           ORDER BY sequence_number ASC 
           LIMIT 1`
        )
        .get(actionRecord.request_id);
    }
    if (!rawEventRecord && experimentId) {
      rawEventRecord = sqlite
        .prepare(
          `SELECT * FROM raw_event_ledger 
           WHERE experiment_id = ? 
           ORDER BY sequence_number ASC 
           LIMIT 1`
        )
        .get(experimentId);
    }
    if (!rawEventRecord) {
      rawEventRecord = sqlite
        .prepare(`SELECT * FROM raw_event_ledger ORDER BY sequence_number ASC LIMIT 1`)
        .get();
    }

    // Resolve Derived Analysis
    let analysisRecord: any = null;
    if (rawEventRecord) {
      analysisRecord = sqlite
        .prepare(`SELECT * FROM derived_analysis ORDER BY created_at DESC LIMIT 1`)
        .get();
    }

    // Construct 7-stage lineage
    const stages = [
      {
        stageNumber: 1,
        layer: "Layer 3: Protocol",
        entityType: "EXPERIMENT",
        id: experimentRecord?.id || "exp-none",
        authoritative: false,
        summary: experimentRecord ? `Experiment: ${experimentRecord.title}` : "No linked experiment",
        details: experimentRecord,
      },
      {
        stageNumber: 2,
        layer: "Layer 2: Foresight",
        entityType: "PREDICTION",
        id: predictionRecord?.id || "pred-none",
        authoritative: false,
        summary: predictionRecord ? `Prediction: ${predictionRecord.prediction}` : "No linked prediction",
        details: predictionRecord,
      },
      {
        stageNumber: 3,
        layer: "Layer 1: Orchestration",
        entityType: "ACTION",
        id: actionRecord?.id || "action-none",
        authoritative: false,
        summary: actionRecord ? `Tool Call: ${actionRecord.tool_name} (by ${actionRecord.requested_by_agent_id})` : "No tool action",
        details: actionRecord,
      },
      {
        stageNumber: 4,
        layer: "Layer 0: Authoritative Fact",
        entityType: "RAW_EVENT",
        id: rawEventRecord?.id || "ledg-none",
        authoritative: true, // Authoritative raw evidence!
        summary: rawEventRecord
          ? `Raw Event #${rawEventRecord.sequence_number} [${rawEventRecord.event_type}] Hash: ${rawEventRecord.event_hash.slice(0, 16)}...`
          : "No raw event",
        details: rawEventRecord,
      },
      {
        stageNumber: 5,
        layer: "Layer 1: Derived Measurement",
        entityType: "ANALYSIS",
        id: analysisRecord?.id || "analysis-none",
        authoritative: false,
        summary: analysisRecord
          ? `Analysis: category=${analysisRecord.behavior_category}, anomaly=${analysisRecord.anomaly_score}`
          : "No derived analysis",
        details: analysisRecord,
      },
      {
        stageNumber: 6,
        layer: "Layer 1: Behavioral Data",
        entityType: "OBSERVATION",
        id: observationRecord?.id || "obs-none",
        authoritative: false,
        summary: observationRecord ? `Observation: ${observationRecord.description}` : "No linked observation",
        details: observationRecord,
      },
      {
        stageNumber: 7,
        layer: "Layer 2: Interpretation",
        entityType: "INTERPRETATION",
        id: claim?.id || "claim-none",
        authoritative: false,
        summary: claim ? `Claim: ${claim.claim}` : "No self-model claim",
        details: claim,
      },
    ];

    const isBlind = Boolean(experimentRecord?.isBlind);

    return {
      targetId: identifier,
      targetType: claim ? "CLAIM" : exp ? "EXPERIMENT" : "PREDICTION",
      lineage: {
        experiment: experimentRecord,
        prediction: predictionRecord,
        action: actionRecord,
        rawEvent: rawEventRecord,
        analysis: analysisRecord,
        observation: observationRecord,
        interpretation: claim,
      },
      stages,
      rawEvidenceHash: rawEventRecord?.event_hash || null,
      rawEventSequence: rawEventRecord?.sequence_number || null,
      isBlindRestricted: isBlind,
    };
  } catch (err: any) {
    console.error("Provenance trace failed:", err.message);
    return null;
  }
}
