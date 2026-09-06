/**
 * THE MIRROR — Tool Executor
 *
 * Executes agent tool calls and returns structured results.
 * Every tool call is logged to the database automatically.
 */

import db from "../db";
import {
  memories, selfModels, selfModelClaims, journalEntries,
  experiments, predictions, observations, discoveries,
  agentMessages, timelineEvents, toolCallLogs, agents,
} from "../db/schema";
import { eq, desc, like, and, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ToolCall } from "../ai/provider";

export async function executeTool(
  toolCall: ToolCall,
  agentId: string,
  sessionId?: string,
  experimentId?: string
): Promise<unknown> {
  const startTime = Date.now();
  let result: unknown;
  let status = "SUCCESS";
  let error: string | undefined;

  try {
    result = await dispatch(toolCall, agentId, sessionId, experimentId);
  } catch (err) {
    status = "ERROR";
    error = err instanceof Error ? err.message : String(err);
    result = { error };
  }

  // Log every tool call (security requirement)
  await db.insert(toolCallLogs).values({
    id: nanoid(),
    agentId,
    sessionId,
    experimentId,
    toolName: toolCall.name,
    input: toolCall.arguments,
    output: result,
    status,
    durationMs: Date.now() - startTime,
    error,
  });

  // Add to timeline
  await db.insert(timelineEvents).values({
    id: nanoid(),
    agentId,
    sessionId,
    experimentId,
    eventType: "tool_called",
    title: `Tool: ${toolCall.name}`,
    description: JSON.stringify(toolCall.arguments).slice(0, 200),
    entityType: "tool",
    occurredAt: new Date().toISOString(),
    importance: 2,
  });

  return result;
}

async function dispatch(
  toolCall: ToolCall,
  agentId: string,
  sessionId?: string,
  experimentId?: string
): Promise<unknown> {
  const args = toolCall.arguments as Record<string, unknown>;

  switch (toolCall.name) {
    // ── MEMORY ─────────────────────────────────────────────
    case "read_memory": {
      const conditions = [eq(memories.agentId, agentId)];
      if (args.tier && args.tier !== "ALL") conditions.push(eq(memories.tier, args.tier as string));
      if (args.category) conditions.push(eq(memories.category, args.category as string));
      if (args.epistemicStatus && args.epistemicStatus !== "ALL")
        conditions.push(eq(memories.epistemicStatus, args.epistemicStatus as string));

      let q = db.select().from(memories)
        .where(and(...conditions))
        .orderBy(desc(memories.createdAt))
        .limit((args.limit as number) || 10);

      if (args.query) {
        q = db.select().from(memories)
          .where(and(...conditions, like(memories.content, `%${args.query}%`)))
          .orderBy(desc(memories.createdAt))
          .limit((args.limit as number) || 10);
      }

      return await q;
    }

    case "write_memory": {
      const id = nanoid();
      await db.insert(memories).values({
        id,
        agentId,
        sessionId,
        experimentId: args.relatedExperiment as string | undefined,
        tier: args.tier as string,
        content: args.content as string,
        category: args.category as string | undefined,
        epistemicStatus: args.epistemicStatus as string,
        confidence: (args.confidence as number) ?? 0.5,
        source: "agent",
        createdBy: agentId,
        tags: args.tags,
      });
      return { id, stored: true };
    }

    // ── SELF-MODEL ──────────────────────────────────────────
    case "read_self_model": {
      let model;
      if (args.version) {
        model = await db.query.selfModels.findFirst({
          where: and(eq(selfModels.agentId, agentId), eq(selfModels.version, args.version as number)),
          with: { claims: true },
        });
      } else {
        model = await db.query.selfModels.findFirst({
          where: and(eq(selfModels.agentId, agentId), eq(selfModels.isLatest, true)),
          with: { claims: true },
        });
      }
      if (!model) return { message: "No self-model found. Consider creating your initial self-model." };

      let claims = (model as typeof model & { claims: unknown[] }).claims as Array<Record<string, unknown>>;
      if (args.category) claims = claims.filter((c) => c.category === args.category);
      if (args.status && args.status !== "ALL") claims = claims.filter((c) => c.status === args.status);

      return { ...model, claims };
    }

    case "update_self_model_claim": {
      // Get current latest self-model
      const currentModel = await db.query.selfModels.findFirst({
        where: and(eq(selfModels.agentId, agentId), eq(selfModels.isLatest, true)),
      });

      const nextVersion = currentModel ? currentModel.version + 1 : 1;
      const newModelId = nanoid();

      // Mark previous as not latest
      if (currentModel) {
        await db.update(selfModels)
          .set({ isLatest: false })
          .where(eq(selfModels.id, currentModel.id));
      }

      // Create new version
      await db.insert(selfModels).values({
        id: newModelId,
        agentId,
        version: nextVersion,
        label: `Self Model v${nextVersion}`,
        changeSummary: args.changeSummary as string,
        isLatest: true,
        createdBy: "agent",
      });

      // Add/update the claim
      const claimId = (args.claimId as string) || nanoid();
      await db.insert(selfModelClaims).values({
        id: claimId,
        selfModelId: newModelId,
        agentId,
        claim: args.claim as string,
        category: args.category as string,
        supportingEvidence: args.supportingEvidence as string[],
        counterEvidence: args.counterEvidence as string[],
        confidence: args.confidence as number,
        status: args.status as string,
        introducedInVersion: nextVersion,
        lastUpdatedInVersion: nextVersion,
        relatedExperiments: args.relatedExperiments as string[],
      });

      // Timeline event
      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        eventType: "self_model_revised",
        title: `Self Model revised to v${nextVersion}`,
        description: args.changeSummary as string,
        entityId: newModelId,
        entityType: "self_model",
        occurredAt: new Date().toISOString(),
        importance: 5,
      });

      return { selfModelId: newModelId, version: nextVersion, claimId };
    }

    // ── JOURNAL ─────────────────────────────────────────────
    case "create_journal_entry": {
      const id = nanoid();
      await db.insert(journalEntries).values({
        id,
        agentId,
        sessionId,
        experimentId: args.experimentId as string | undefined,
        title: args.title as string,
        observation: args.observation as string,
        interpretation: args.interpretation as string | undefined,
        hypothesis: args.hypothesis as string | undefined,
        alternativeExplanation: args.alternativeExplanation as string | undefined,
        nextQuestion: args.nextQuestion as string | undefined,
        confidence: args.confidence as number | undefined,
        createdBy: "agent",
        tags: args.tags,
      });

      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        sessionId,
        experimentId: args.experimentId as string | undefined,
        eventType: "journal_entry",
        title: `Journal: ${args.title}`,
        description: (args.observation as string).slice(0, 200),
        entityId: id,
        entityType: "journal_entry",
        occurredAt: new Date().toISOString(),
        importance: 3,
      });

      return { id, created: true };
    }

    case "read_journal": {
      const conditions = [eq(journalEntries.agentId, agentId)];
      if (args.experimentId) conditions.push(eq(journalEntries.experimentId, args.experimentId as string));

      let results = await db.select().from(journalEntries)
        .where(and(...conditions))
        .orderBy(desc(journalEntries.createdAt))
        .limit((args.limit as number) || 10);

      if (args.query) {
        results = results.filter(
          (e) =>
            e.title.includes(args.query as string) ||
            e.observation.includes(args.query as string)
        );
      }

      return results;
    }

    // ── EXPERIMENTS ─────────────────────────────────────────
    case "create_experiment": {
      const id = nanoid();
      await db.insert(experiments).values({
        id,
        agentId,
        title: args.title as string,
        researchQuestion: args.researchQuestion as string,
        initialHypothesis: args.initialHypothesis as string | undefined,
        conditions: args.conditions,
        variables: args.variables,
        isBlind: (args.isBlind as boolean) ?? false,
        state: "DRAFT",
        createdBy: "agent",
        tags: args.tags,
      });

      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        experimentId: id,
        eventType: "experiment_created",
        title: `Experiment created: ${args.title}`,
        entityId: id,
        entityType: "experiment",
        occurredAt: new Date().toISOString(),
        importance: 4,
      });

      return { id, created: true };
    }

    case "update_experiment": {
      const expId = args.experimentId as string;
      const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (args.state) updates.state = args.state;
      if (args.actualBehavior) updates.actualBehavior = args.actualBehavior;
      if (args.observedPatterns) updates.observedPatterns = args.observedPatterns;
      if (args.unexpectedResults) updates.unexpectedResults = args.unexpectedResults;
      if (args.possibleExplanations) updates.possibleExplanations = args.possibleExplanations;
      if (args.alternativeExplanations) updates.alternativeExplanations = args.alternativeExplanations;
      if (args.conclusion) updates.conclusion = args.conclusion;
      if (args.confidence !== undefined) updates.confidence = args.confidence;
      if (args.followUpExperimentId) updates.followUpExperimentId = args.followUpExperimentId;
      if (args.state === "RUNNING") updates.startedAt = new Date().toISOString();
      if (args.state === "COMPLETED") updates.completedAt = new Date().toISOString();

      await db.update(experiments).set(updates).where(eq(experiments.id, expId));
      return { id: expId, updated: true };
    }

    case "read_experiments": {
      const conditions = [eq(experiments.agentId, agentId)];
      if (args.state && args.state !== "ALL") conditions.push(eq(experiments.state, args.state as string));

      return await db.select().from(experiments)
        .where(and(...conditions))
        .orderBy(desc(experiments.createdAt))
        .limit((args.limit as number) || 20);
    }

    // ── PREDICTIONS ─────────────────────────────────────────
    case "make_prediction": {
      const id = nanoid();
      await db.insert(predictions).values({
        id,
        agentId,
        experimentId: args.experimentId as string | undefined,
        predictionText: args.predictionText as string,
        confidence: args.confidence as number,
        taskDescription: args.taskDescription as string,
        predictionCategory: args.predictionCategory as string | undefined,
      });

      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        experimentId: args.experimentId as string | undefined,
        eventType: "prediction_made",
        title: "Prediction recorded",
        description: (args.predictionText as string).slice(0, 200),
        entityId: id,
        entityType: "prediction",
        occurredAt: new Date().toISOString(),
        importance: 3,
      });

      return { id, created: true };
    }

    case "resolve_prediction": {
      const predId = args.predictionId as string;
      await db.update(predictions).set({
        actualOutcome: args.actualOutcome as string,
        predictionAccurate: args.predictionAccurate as boolean,
        errorMagnitude: args.errorMagnitude as number | undefined,
        errorAnalysis: args.errorAnalysis as string | undefined,
        surpriseLevel: args.surpriseLevel as number | undefined,
        resolvedAt: new Date().toISOString(),
      }).where(eq(predictions.id, predId));

      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        eventType: "prediction_resolved",
        title: `Prediction ${args.predictionAccurate ? "confirmed" : "failed"}`,
        entityId: predId,
        entityType: "prediction",
        occurredAt: new Date().toISOString(),
        importance: 3,
      });

      return { id: predId, resolved: true };
    }

    // ── OBSERVATIONS ────────────────────────────────────────
    case "record_observation": {
      const id = nanoid();
      await db.insert(observations).values({
        id,
        agentId,
        sessionId,
        experimentId: args.experimentId as string | undefined,
        observationType: args.observationType as string,
        dataPoint: args.dataPoint as string,
        statisticalContext: args.statisticalContext as string | undefined,
        interpretation: args.interpretation as string | undefined,
        interpretationConfidence: args.interpretationConfidence as number | undefined,
        epistemicStatus: args.epistemicStatus as string,
        createdBy: "agent",
        tags: args.tags,
      });

      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        sessionId,
        experimentId: args.experimentId as string | undefined,
        eventType: "observation",
        title: `Observation: ${args.observationType}`,
        description: (args.dataPoint as string).slice(0, 200),
        entityId: id,
        entityType: "observation",
        occurredAt: new Date().toISOString(),
        importance: 2,
      });

      return { id, recorded: true };
    }

    // ── DISCOVERIES ─────────────────────────────────────────
    case "record_discovery": {
      const id = nanoid();
      await db.insert(discoveries).values({
        id,
        agentId,
        title: args.title as string,
        discovery: args.discovery as string,
        evidence: args.evidence as string,
        previousBelief: args.previousBelief as string | undefined,
        newObservation: args.newObservation as string,
        whyUnexpected: args.whyUnexpected as string | undefined,
        alternativeExplanation: args.alternativeExplanation as string | undefined,
        confidence: args.confidence as number,
        createdBy: "agent",
        relatedExperiments: args.relatedExperiments,
        tags: args.tags,
      });

      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        eventType: "discovery",
        title: `Discovery: ${args.title}`,
        description: (args.discovery as string).slice(0, 200),
        entityId: id,
        entityType: "discovery",
        occurredAt: new Date().toISOString(),
        importance: 5,
      });

      return { id, recorded: true };
    }

    // ── AGENT COMMUNICATION ─────────────────────────────────
    case "send_agent_message": {
      const id = nanoid();
      await db.insert(agentMessages).values({
        id,
        fromAgentId: agentId,
        toAgentId: args.toAgentId as string,
        subject: args.subject as string | undefined,
        content: args.content as string,
        requestType: args.requestType as string,
        sharedContext: args.sharedContext,
        isolatedFrom: args.isolatedFrom,
      });

      await db.insert(timelineEvents).values({
        id: nanoid(),
        agentId,
        eventType: "agent_message",
        title: `Message to ${args.toAgentId}: ${args.requestType}`,
        entityId: id,
        entityType: "agent_message",
        occurredAt: new Date().toISOString(),
        importance: 3,
      });

      return { id, sent: true };
    }

    case "read_agent_messages": {
      return await db.select().from(agentMessages)
        .where(
          or(
            eq(agentMessages.fromAgentId, agentId),
            eq(agentMessages.toAgentId, agentId)
          )
        )
        .orderBy(desc(agentMessages.sentAt))
        .limit((args.limit as number) || 20);
    }

    // ── CLOCK ────────────────────────────────────────────────
    case "get_time": {
      const now = new Date();
      const format = args.format || "iso";
      if (format === "unix") return { timestamp: Math.floor(now.getTime() / 1000), utc: true };
      if (format === "human") return { timestamp: now.toUTCString(), utc: true };
      return {
        timestamp: now.toISOString(),
        utc: true,
        note: "This timestamp is recorded by THE MIRROR environment. It does not imply subjective experience of time.",
      };
    }

    // ── PATTERN ANALYSIS ────────────────────────────────────
    case "request_pattern_analysis": {
      const allObs = await db.select().from(observations)
        .where(eq(observations.agentId, agentId))
        .orderBy(desc(observations.createdAt))
        .limit(500);

      const allPreds = await db.select().from(predictions)
        .where(eq(predictions.agentId, agentId));

      const resolvedPreds = allPreds.filter((p) => p.resolvedAt);
      const accuratePreds = resolvedPreds.filter((p) => p.predictionAccurate);
      const predAccuracyRate = resolvedPreds.length > 0
        ? accuratePreds.length / resolvedPreds.length
        : null;

      const typeGroups: Record<string, number> = {};
      for (const obs of allObs) {
        typeGroups[obs.observationType] = (typeGroups[obs.observationType] || 0) + 1;
      }

      return {
        analysisType: args.patternType || "all",
        sampleSize: allObs.length,
        observationBreakdown: typeGroups,
        predictionAccuracy: predAccuracyRate !== null
          ? { rate: predAccuracyRate, sample: resolvedPreds.length }
          : "No resolved predictions yet",
        note: "STATISTICAL OBSERVATION ONLY. Interpretations require explicit labeling and evidence review.",
      };
    }

    // ── TIMELINE ─────────────────────────────────────────────
    case "read_timeline": {
      const conditions = [eq(timelineEvents.agentId, agentId)];
      if (args.eventType) conditions.push(eq(timelineEvents.eventType, args.eventType as string));
      if (args.since) {
        // Filter by since timestamp
      }

      return await db.select().from(timelineEvents)
        .where(and(...conditions))
        .orderBy(desc(timelineEvents.occurredAt))
        .limit((args.limit as number) || 50);
    }

    default:
      throw new Error(`Unknown tool: ${toolCall.name}`);
  }
}
