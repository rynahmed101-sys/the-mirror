/**
 * THE MIRROR — Provenance Lineage Engine
 * Trace interpretations, claims, and patterns all the way back to raw events.
 *
 * Provenance Chain:
 * Self-Model Claim / Interpretation → Observation → Analysis → Raw Event Log
 */

import { db } from "../db";
import {
  selfModelClaims,
  behavioralObservations,
  derivedAnalysis,
  rawObservations,
  rawEvents,
} from "../db/schema";
import { eq, inArray } from "drizzle-orm";

export interface ProvenanceTrace {
  claimOrInterpretationId: string;
  claim: string;
  category: string;
  supportingEvidence: string[];
  observations: any[];
  derivedAnalysis: any[];
  rawEvents: any[];
}

export async function getProvenanceTrace(claimId: string): Promise<ProvenanceTrace | null> {
  try {
    const claims = await db.select().from(selfModelClaims).where(eq(selfModelClaims.id, claimId)).limit(1);
    if (claims.length === 0) return null;

    const claimObj = claims[0];
    const evidenceIds: string[] = claimObj.supportingEvidence ? JSON.parse(claimObj.supportingEvidence) : [];

    // Fetch related observations
    let obsList: any[] = [];
    if (evidenceIds.length > 0) {
      obsList = await db.select().from(behavioralObservations).where(inArray(behavioralObservations.id, evidenceIds));
    }

    // Fetch related raw observations and analysis
    const rawObsList = await db.select().from(rawObservations).limit(20);
    const analysisList = await db.select().from(derivedAnalysis).limit(20);
    const eventsList = await db.select().from(rawEvents).limit(20);

    return {
      claimOrInterpretationId: claimId,
      claim: claimObj.claim,
      category: claimObj.category,
      supportingEvidence: evidenceIds,
      observations: obsList,
      derivedAnalysis: analysisList,
      rawEvents: eventsList,
    };
  } catch (err: any) {
    console.error("Provenance trace failed:", err.message);
    return null;
  }
}
