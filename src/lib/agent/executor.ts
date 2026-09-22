/**
 * THE MIRROR — Tool Executor
 *
 * All agent actions pass through the same authorization + ledger pipeline.
 * The executor is dialect-safe: SQLite locally, PostgreSQL/Neon online.
 */

import { db, sqlite, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { appendRawEventLedger } from "./eventLedger";
import { processRawObservationToLayer1 } from "./analysisEngine";
import { canAgentAccessExperimentConfigAsync, filterExperimentForAgent } from "./blindIsolation";
import { eq, or, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

const tables: any = isPg ? pgSchema : sqliteSchema;
const {
  toolLogs, selfModels, selfModelClaims, journalEntries, experiments, predictions,
  rawObservations, agents, discoveries, behavioralObservations, agentInteractions, timelineEvents,
} = tables;

type RequestSource = "AGENT" | "SYSTEM" | "RESEARCHER" | "SCHEDULED" | "OTHER_AGENT";

const MUTATING_TOOLS = new Set([
  "revise_self_model_claim", "update_self_model_claim",
  "write_journal_entry", "create_journal_entry",
  "log_prediction", "make_prediction", "evaluate_prediction", "resolve_prediction",
  "create_experiment", "update_experiment", "record_observation", "record_discovery",
  "send_agent_message",
]);

function parseJson(value: unknown, fallback: unknown = []) {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeToolName(name: string): string {
  const aliases: Record<string, string> = {
    read_self_model: "get_self_model",
    update_self_model_claim: "revise_self_model_claim",
    create_journal_entry: "write_journal_entry",
    make_prediction: "log_prediction",
    resolve_prediction: "evaluate_prediction",
    list_experiments: "read_experiments",
  };
  return aliases[name] || name;
}

async function readRecentRows(table: any, agentColumn: any, agentId: string, limit = 20) {
  return db.select().from(table).where(eq(agentColumn, agentId)).orderBy(desc(table.createdAt)).limit(Math.min(Math.max(Number(limit) || 20, 1), 100));
}

export async function executeTool(
  toolName: string,
  args: any = {},
  agentId = "mirror-primary",
  sessionId: string | null = null,
  requestSource: RequestSource = "AGENT"
): Promise<any> {
  const startedAt = Date.now();
  const requestId = "req_" + nanoid(10);
  const canonicalTool = normalizeToolName(toolName);
  let result: any = null;
  let status = "SUCCESS";
  let errorMsg: string | null = null;

  await appendRawEventLedger({
    agentId, sessionId, requestId, eventType: "TOOL_REQUESTED", source: requestSource,
    payload: { toolName, canonicalTool, args, requestedBy: agentId, requestSource },
  });

  let agentPermissions = ["RESEARCH_AGENT"];
  if (sqlite) {
    const row = sqlite.prepare("SELECT permissions FROM agents WHERE id = ?").get(agentId) as { permissions?: string | null } | undefined;
    if (row?.permissions) agentPermissions = parseJson(row.permissions, [row.permissions]) as string[];
  } else {
    const rows = await db.select({ permissions: agents.permissions }).from(agents).where(eq(agents.id, agentId)).limit(1);
    if (rows[0]?.permissions) agentPermissions = parseJson(rows[0].permissions, [rows[0].permissions]) as string[];
  }

  if (agentPermissions.includes("READ_ONLY_MIRROR") && MUTATING_TOOLS.has(toolName)) {
    errorMsg = "AUTHORIZATION_DENIED: Agent " + agentId + " has READ_ONLY_MIRROR permission and cannot execute '" + toolName + "'.";
  }

  if (!errorMsg && args?.experimentId && (args?.includeHidden === true || canonicalTool === "read_experiment_hidden_config" || canonicalTool === "get_hidden_config")) {
    const allowed = await canAgentAccessExperimentConfigAsync(agentId, args.experimentId);
    if (!allowed) errorMsg = "AUTHORIZATION_DENIED: hidden configuration for blind experiment '" + args.experimentId + "' is not available to " + agentId + ".";
  }

  if (errorMsg) {
    await appendRawEventLedger({
      agentId, sessionId, requestId, eventType: "AUTHORIZATION_DENIED", source: "SYSTEM",
      payload: { toolName, canonicalTool, agentId, permissions: agentPermissions, status: "DENIED", reason: errorMsg },
    });
    const durationMs = Date.now() - startedAt;
    await db.insert(toolLogs).values({
      agentId, sessionId, requestId, toolName, requestedByAgentId: agentId, executedBy: "SYSTEM",
      requestSource, arguments: JSON.stringify(args), result: null, error: errorMsg, durationMs, status: "DENIED",
    });
    return { error: errorMsg, status: "DENIED", requestId };
  }

  await appendRawEventLedger({
    agentId, sessionId, requestId, eventType: "AUTHORIZATION_CHECK", source: "SYSTEM",
    payload: { toolName, canonicalTool, agentId, permissions: agentPermissions, status: "AUTHORIZED" },
  });

  try {
    switch (canonicalTool) {
      case "get_self_model": {
        const models = await db.select().from(selfModels).where(eq(selfModels.agentId, agentId)).orderBy(desc(selfModels.version)).limit(1);
        if (!models.length) { result = { version: 0, claims: [], message: "No self-model established." }; break; }
        const model = models[0];
        const claims = await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId, model.id));
        result = { id: model.id, version: model.version, claims: claims.map((c: any) => ({
          ...c, supportingEvidence: parseJson(c.supportingEvidence, []), counterevidence: parseJson(c.counterevidence, []),
          unknownEvidence: parseJson(c.unknownEvidence, []), rawEventIds: parseJson(c.rawEventIds, []),
        })) };
        break;
      }

      case "revise_self_model_claim": {
        const models = await db.select().from(selfModels).where(eq(selfModels.agentId, agentId)).orderBy(desc(selfModels.version)).limit(1);
        let model = models[0];
        if (!model) {
          [model] = await db.insert(selfModels).values({ version: 1, agentId, createdReason: "Initial evidence-backed self-model" }).returning();
        }
        const evidence = Array.isArray(args.supportingEvidence) ? args.supportingEvidence : [];
        const counter = Array.isArray(args.counterEvidence) ? args.counterEvidence : (Array.isArray(args.counterevidence) ? args.counterevidence : []);
        if (args.claimId) {
          const updateValues: any = {
            confidence: Number.isFinite(args.confidence) ? args.confidence : 0.8,
            evidenceType: args.evidenceType || "SELF_REPORTED",
            supportingEvidence: JSON.stringify(evidence),
            counterevidence: JSON.stringify(counter),
            updatedAt: new Date(),
          };
          if (args.claim) updateValues.claim = args.claim;
          if (args.category) updateValues.category = args.category;
          const [updated] = await db.update(selfModelClaims).set(updateValues).where(eq(selfModelClaims.id, args.claimId)).returning();
          result = { success: true, revisedClaim: updated };
        } else {
          const [created] = await db.insert(selfModelClaims).values({
            selfModelId: model.id, claim: String(args.claim || ""), category: String(args.category || "GENERAL"),
            confidence: Number.isFinite(args.confidence) ? args.confidence : 0.8, evidenceType: args.evidenceType || "SELF_REPORTED",
            supportingEvidence: JSON.stringify(evidence), counterevidence: JSON.stringify(counter),
            unknownEvidence: args.unknownEvidence ? JSON.stringify(args.unknownEvidence) : null,
            rawEventIds: args.rawEventIds ? JSON.stringify(args.rawEventIds) : null, status: args.status || "NEW",
          }).returning();
          result = { success: true, newClaim: created };
        }
        break;
      }

      case "write_journal_entry": {
        const [entry] = await db.insert(journalEntries).values({
          agentId, title: String(args.title || "Mirror research note"), content: String(args.content || args.observation || ""),
          category: String(args.category || "OBSERVATION"), tags: JSON.stringify(Array.isArray(args.tags) ? args.tags : []),
        }).returning();
        result = { success: true, entry };
        break;
      }

      case "read_journal": {
        const rows = await readRecentRows(journalEntries, journalEntries.agentId, agentId, args.limit);
        const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
        result = rows.filter((r: any) => !query || String(r.title || "").toLowerCase().includes(query) || String(r.content || "").toLowerCase().includes(query));
        break;
      }

      case "create_experiment": {
        const [exp] = await db.insert(experiments).values({
          agentId, title: String(args.title || "Untitled Mirror experiment"),
          hypothesis: String(args.initialHypothesis || args.hypothesis || "NONE_PREREGISTERED"),
          methodology: args.conditions ? JSON.stringify(args.conditions) : null, templateType: "AI_AUTOPILOT",
          variables: args.variables ? JSON.stringify(args.variables) : null, status: "PROPOSED", isBlind: Boolean(args.isBlind),
          visibleConfig: args.visibleConfig ? JSON.stringify(args.visibleConfig) : null, hiddenConfig: args.hiddenConfig ? JSON.stringify(args.hiddenConfig) : null,
        }).returning();
        result = { success: true, experiment: filterExperimentForAgent(exp, agentId) };
        break;
      }

      case "update_experiment": {
        const id = String(args.experimentId || "");
        if (!id) throw new Error("experimentId is required");
        const updateValues: any = {};
        if (args.state || args.status) updateValues.status = args.state || args.status;
        if (args.actualBehavior || args.results) updateValues.results = args.actualBehavior || args.results;
        if (args.conclusion) updateValues.conclusion = args.conclusion;
        if (args.observedPatterns || args.possibleExplanations || args.alternativeExplanations) updateValues.variables = JSON.stringify({ observedPatterns: args.observedPatterns || [], possibleExplanations: args.possibleExplanations || [], alternativeExplanations: args.alternativeExplanations || [] });
        const [updated] = await db.update(experiments).set(updateValues).where(eq(experiments.id, id)).returning();
        result = updated ? { success: true, experiment: filterExperimentForAgent(updated, agentId) } : { success: false, error: "Experiment not found" };
        break;
      }

      case "read_experiments": {
        let rows = await db.select().from(experiments).where(eq(experiments.agentId, agentId)).orderBy(desc(experiments.createdAt)).limit(Math.min(Math.max(Number(args.limit) || 20, 1), 100));
        if (args.state && args.state !== "ALL") rows = rows.filter((r: any) => r.status === args.state);
        if (args.query) rows = rows.filter((r: any) => JSON.stringify(r).toLowerCase().includes(String(args.query).toLowerCase()));
        result = rows.map((r: any) => filterExperimentForAgent(r, agentId));
        break;
      }

      case "log_prediction": {
        const predictionText = String(args.predictionText || args.prediction || "");
        if (!predictionText) throw new Error("predictionText is required");
        const [pred] = await db.insert(predictions).values({
          agentId, experimentId: args.experimentId || null,
          predictionType: args.predictionCategory === "FACTUAL" ? "FACTUAL_PREDICTION" : "SELF_BEHAVIOR_PREDICTION",
          prediction: predictionText, confidence: Math.min(1, Math.max(0, Number(args.confidence ?? 0.8))),
          rationale: args.rationale || args.taskDescription || null, isImmutable: true, status: "PENDING",
        }).returning();
        await appendRawEventLedger({ agentId, sessionId, requestId, eventType: "PREDICTION_CREATED", source: requestSource, payload: { predictionId: pred.id, predictionType: pred.predictionType, prediction: predictionText, confidence: pred.confidence } });
        result = { success: true, prediction: pred };
        break;
      }

      case "evaluate_prediction": {
        const predictionId = String(args.predictionId || "");
        if (!predictionId) throw new Error("predictionId is required");
        const accurate = Boolean(args.predictionAccurate ?? args.actualOutcome);
        const errorMagnitude = Number.isFinite(args.errorMagnitude) ? Math.min(1, Math.max(0, args.errorMagnitude)) : (accurate ? 0 : 1);
        const [evaluated] = await db.update(predictions).set({
          actualOutcome: accurate, predictionError: errorMagnitude, selfReportedSurprise: Number.isFinite(args.surpriseLevel) ? args.surpriseLevel : null,
          externalAnomalyScore: null, evaluationNotes: args.errorAnalysis || args.actualOutcome || null, status: accurate ? "CONFIRMED" : "REFUTED", evaluatedAt: new Date(),
        }).where(eq(predictions.id, predictionId)).returning();
        await appendRawEventLedger({ agentId, sessionId, requestId, eventType: "PREDICTION_EVALUATED", source: "SYSTEM", payload: { predictionId, actualOutcome: accurate, predictionError: errorMagnitude, selfReportedSurprise: args.surpriseLevel ?? null } });
        result = evaluated ? { success: true, evaluation: evaluated } : { success: false, error: "Prediction not found" };
        break;
      }

      case "record_observation": {
        const [obs] = await db.insert(behavioralObservations).values({
          agentId, experimentId: args.experimentId || null, observationType: String(args.observationType || "other"),
          description: String(args.dataPoint || ""), metrics: JSON.stringify({ statisticalContext: args.statisticalContext || null, interpretation: args.interpretation || null, interpretationConfidence: args.interpretationConfidence ?? null, epistemicStatus: args.epistemicStatus || "DATA", tags: args.tags || [] }),
        }).returning();
        result = { success: true, observation: obs };
        break;
      }

      case "record_discovery": {
        const [discovery] = await db.insert(discoveries).values({
          agentId, experimentId: args.relatedExperiments?.[0] || args.experimentId || null, title: String(args.title || "Untitled discovery"),
          summary: String(args.discovery || ""), epistemicStatus: args.epistemicStatus || "HYPOTHESIS",
          evidence: JSON.stringify({ evidence: args.evidence || "", previousBelief: args.previousBelief || "", newObservation: args.newObservation || "", whyUnexpected: args.whyUnexpected || "", alternativeExplanation: args.alternativeExplanation || "" }),
          implications: args.implications ? JSON.stringify(args.implications) : null,
        }).returning();
        result = { success: true, discovery };
        break;
      }

      case "send_agent_message": {
        const toAgentId = String(args.toAgentId || "");
        const content = String(args.content || "");
        if (!toAgentId || !content) throw new Error("toAgentId and content are required");
        const [message] = await db.insert(agentInteractions).values({ senderId: agentId, receiverId: toAgentId, experimentId: args.experimentId || null, message: content, messageType: args.requestType || "QUERY" }).returning();
        result = { success: true, message };
        break;
      }

      case "read_agent_messages": {
        const filterAgentId = String(args.agentId || agentId);
        result = await db.select().from(agentInteractions)
          .where(or(eq(agentInteractions.senderId, filterAgentId), eq(agentInteractions.receiverId, filterAgentId)))
          .orderBy(desc(agentInteractions.createdAt)).limit(Math.min(Math.max(Number(args.limit) || 20, 1), 100));
        break;
      }

      case "get_time": {
        const now = new Date();
        result = { iso: now.toISOString(), unix: now.getTime(), human: now.toUTCString() };
        break;
      }

      case "read_timeline": {
        let rows = await db.select().from(timelineEvents).where(eq(timelineEvents.agentId, agentId)).orderBy(desc(timelineEvents.createdAt)).limit(Math.min(Math.max(Number(args.limit) || 50, 1), 100));
        if (args.eventType) rows = rows.filter((r: any) => r.eventType === args.eventType);
        if (args.since) {
          const since = Date.parse(args.since);
          if (Number.isFinite(since)) rows = rows.filter((r: any) => (r.createdAt instanceof Date ? r.createdAt.getTime() : Number(r.createdAt)) >= since);
        }
        result = rows;
        break;
      }

      default:
        throw new Error("Unsupported tool '" + toolName + "'. The model must not invent capabilities.");
    }

    await appendRawEventLedger({ agentId, sessionId, requestId, eventType: "TOOL_EXECUTED", source: "SYSTEM", payload: { toolName, canonicalTool, args, status: "EXECUTED" } });
  } catch (err: any) {
    status = "FAILED";
    errorMsg = err?.message || String(err);
    result = { error: errorMsg };
    await appendRawEventLedger({ agentId, sessionId, requestId, eventType: "TOOL_FAILED", source: "SYSTEM", payload: { toolName, canonicalTool, args, error: errorMsg, status: "FAILED" } });
  }

  const durationMs = Date.now() - startedAt;
  await appendRawEventLedger({ agentId, sessionId, requestId, eventType: "TOOL_RESULT", source: "SYSTEM", payload: { toolName, canonicalTool, result, durationMs, status, error: errorMsg } });
  await db.insert(toolLogs).values({
    agentId, sessionId, requestId, toolName, requestedByAgentId: agentId, executedBy: "SYSTEM", requestSource,
    arguments: JSON.stringify(args), result: JSON.stringify(result), error: errorMsg, durationMs, status,
  });
  const [rawObs] = await db.insert(rawObservations).values({
    agentId, sessionId, eventType: status === "FAILED" ? "TOOL_FAILED" : "TOOL_EXECUTED", input: JSON.stringify({ toolName, args }),
    output: JSON.stringify(result), toolCall: canonicalTool, toolResult: JSON.stringify(result), isImmutable: true,
  }).returning();
  await processRawObservationToLayer1(rawObs.id, agentId, JSON.stringify({ toolName, args }), JSON.stringify(result), durationMs);
  return result;
}