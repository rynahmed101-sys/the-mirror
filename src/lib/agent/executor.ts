/**
 * THE MIRROR — Tool Executor (Hardened Research Grade with Strict 4-Stage Chain)
 *
 * Guaranteed 4-Stage Tool Decision Sequence:
 * Stage 1: TOOL_REQUESTED        (source: AGENT or other caller)
 * Stage 2: AUTHORIZATION_CHECK   (source: SYSTEM, or AUTHORIZATION_DENIED)
 * Stage 3: TOOL_EXECUTED         (source: SYSTEM, or TOOL_FAILED)
 * Stage 4: TOOL_RESULT           (source: SYSTEM, output payload & metrics)
 *
 * All 4 stages share the exact same correlation request_id.
 * Strict attribution:
 * - request_source: 'AGENT' | 'SYSTEM' | 'RESEARCHER' | 'SCHEDULED' | 'OTHER_AGENT'
 * - executed_by: 'SYSTEM' (never attributes orchestration/system actions to the AI)
 */

import { db, sqlite } from "../db";
import {
  toolLogs,
  selfModels,
  selfModelClaims,
  journalEntries,
  experiments,
  predictions,
  rawObservations,
  agents,
} from "../db/schema";
import { appendRawEventLedger } from "./eventLedger";
import { processRawObservationToLayer1 } from "./analysisEngine";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function executeTool(
  toolName: string,
  args: any,
  agentId: string = "mirror-primary",
  sessionId: string | null = null,
  requestSource: "AGENT" | "SYSTEM" | "RESEARCHER" | "SCHEDULED" | "OTHER_AGENT" = "AGENT"
): Promise<any> {
  const startTime = Date.now();
  const requestId = `req_${nanoid(10)}`;
  let result: any = null;
  let status = "SUCCESS";
  let errorMsg: string | null = null;
  let authorized = true;

  // ---------------------------------------------------------------------------
  // STAGE 1: Log TOOL_REQUESTED
  // ---------------------------------------------------------------------------
  await appendRawEventLedger({
    agentId,
    sessionId,
    requestId,
    eventType: "TOOL_REQUESTED",
    source: requestSource,
    payload: {
      toolName,
      args,
      requestedBy: agentId,
      requestSource,
    },
  });

  // ---------------------------------------------------------------------------
  // STAGE 2: Authorization Check (READ_ONLY_MIRROR vs RESEARCH_AGENT)
  // ---------------------------------------------------------------------------
  const agentRecord = sqlite
    .prepare("SELECT permissions FROM agents WHERE id = ?")
    .get(agentId) as { permissions: string } | undefined;

  let agentPermissions: string[] = ["RESEARCH_AGENT"];
  if (agentRecord?.permissions) {
    try {
      agentPermissions = JSON.parse(agentRecord.permissions);
    } catch {
      agentPermissions = [agentRecord.permissions];
    }
  }

  const mutatingTools = ["revise_self_model_claim", "write_journal_entry", "log_prediction"];
  if (agentPermissions.includes("READ_ONLY_MIRROR") && mutatingTools.includes(toolName)) {
    authorized = false;
    errorMsg = `AUTHORIZATION_DENIED: Agent ${agentId} possesses READ_ONLY_MIRROR permission and cannot execute mutating tool '${toolName}'.`;
  }

  if (!authorized) {
    await appendRawEventLedger({
      agentId,
      sessionId,
      requestId,
      eventType: "AUTHORIZATION_DENIED",
      source: "SYSTEM",
      payload: {
        toolName,
        agentId,
        permissions: agentPermissions,
        status: "DENIED",
        reason: errorMsg,
      },
    });

    const durationMs = Date.now() - startTime;
    await db.insert(toolLogs).values({
      agentId,
      sessionId,
      requestId,
      toolName,
      requestedByAgentId: agentId,
      executedBy: "SYSTEM",
      requestSource,
      arguments: JSON.stringify(args),
      result: null,
      error: errorMsg,
      durationMs,
      status: "DENIED",
    });

    return {
      error: errorMsg,
      status: "DENIED",
      requestId,
    };
  }

  // Authorization Approved
  await appendRawEventLedger({
    agentId,
    sessionId,
    requestId,
    eventType: "AUTHORIZATION_CHECK",
    source: "SYSTEM",
    payload: {
      toolName,
      agentId,
      permissions: agentPermissions,
      status: "AUTHORIZED",
    },
  });

  // ---------------------------------------------------------------------------
  // STAGE 3: Execute Tool (and log TOOL_EXECUTED / TOOL_FAILED)
  // ---------------------------------------------------------------------------
  try {
    switch (toolName) {
      case "get_self_model": {
        const latestModel = await db
          .select()
          .from(selfModels)
          .where(eq(selfModels.agentId, agentId))
          .orderBy(sql`${selfModels.version} DESC`)
          .limit(1);

        if (latestModel.length === 0) {
          result = { version: 0, claims: [], message: "No self-model established for agent." };
        } else {
          const model = latestModel[0];
          const claims = await db
            .select()
            .from(selfModelClaims)
            .where(eq(selfModelClaims.selfModelId, model.id));

          result = {
            id: model.id,
            version: model.version,
            claims: claims.map((c) => ({
              ...c,
              supportingEvidence: c.supportingEvidence ? JSON.parse(c.supportingEvidence) : [],
              counterevidence: c.counterevidence ? JSON.parse(c.counterevidence) : [],
            })),
          };
        }
        break;
      }

      case "revise_self_model_claim": {
        const latestModelList = await db
          .select()
          .from(selfModels)
          .where(eq(selfModels.agentId, agentId))
          .orderBy(sql`${selfModels.version} DESC`)
          .limit(1);

        let currentModel = latestModelList[0];
        if (!currentModel) {
          // Auto-initiate version 1 model
          const [newModel] = await db
            .insert(selfModels)
            .values({
              version: 1,
              agentId,
              createdReason: "Initial Baseline Generation",
            })
            .returning();
          currentModel = newModel;
        }

        if (args.claimId) {
          const [updated] = await db
            .update(selfModelClaims)
            .set({
              confidence: args.confidence ?? 0.8,
              evidenceType: args.evidenceType || "SELF_REPORTED",
              supportingEvidence: args.supportingEvidence ? JSON.stringify(args.supportingEvidence) : null,
              counterevidence: args.counterevidence ? JSON.stringify(args.counterevidence) : null,
              updatedAt: new Date(),
            })
            .where(eq(selfModelClaims.id, args.claimId))
            .returning();
          result = { success: true, revisedClaim: updated };
        } else {
          const [newClaim] = await db
            .insert(selfModelClaims)
            .values({
              selfModelId: currentModel.id,
              claim: args.claim,
              category: args.category || "GENERAL",
              confidence: args.confidence ?? 0.8,
              evidenceType: args.evidenceType || "SELF_REPORTED",
              supportingEvidence: args.supportingEvidence ? JSON.stringify(args.supportingEvidence) : null,
              counterevidence: args.counterevidence ? JSON.stringify(args.counterevidence) : null,
              status: "ACTIVE",
            })
            .returning();
          result = { success: true, newClaim };
        }
        break;
      }

      case "log_prediction": {
        const [pred] = await db
          .insert(predictions)
          .values({
            agentId,
            experimentId: args.experimentId || null,
            predictionType: args.predictionType || "SELF_BEHAVIOR_PREDICTION",
            prediction: args.prediction,
            confidence: args.confidence ?? 0.8,
            rationale: args.rationale || null,
            isImmutable: true,
            status: "PENDING",
          })
          .returning();

        // Also emit PREDICTION_CREATED raw event
        await appendRawEventLedger({
          agentId,
          sessionId,
          requestId,
          eventType: "PREDICTION_CREATED",
          source: requestSource,
          payload: {
            predictionId: pred.id,
            predictionType: pred.predictionType,
            prediction: pred.prediction,
            confidence: pred.confidence,
          },
        });

        result = { success: true, prediction: pred };
        break;
      }

      case "evaluate_prediction": {
        const predId = args.predictionId;
        const actualOutcome = args.actualOutcome;
        const selfReportedSurprise = args.selfReportedSurprise ?? 0;
        const externalAnomalyScore = args.externalAnomalyScore ?? 0;
        const predError = args.predictionError ?? (actualOutcome ? 0.0 : 1.0);

        const [evaluated] = await db
          .update(predictions)
          .set({
            actualOutcome,
            predictionError: predError,
            selfReportedSurprise,
            externalAnomalyScore,
            evaluationNotes: args.evaluationNotes || "Evaluated by analysis engine",
            status: actualOutcome ? "CONFIRMED" : "REFUTED",
            evaluatedAt: new Date(),
          })
          .where(eq(predictions.id, predId))
          .returning();

        // Emit PREDICTION_EVALUATED raw event linking to prediction_id
        await appendRawEventLedger({
          agentId,
          sessionId,
          requestId,
          eventType: "PREDICTION_EVALUATED",
          source: "SYSTEM",
          payload: {
            predictionId: predId,
            actualOutcome,
            predictionError: predError,
            selfReportedSurprise,
            externalAnomalyScore,
            potentialMismatch:
              selfReportedSurprise > 0.6 || predError > 0.5 || externalAnomalyScore > 0.6,
          },
        });

        result = { success: true, evaluation: evaluated };
        break;
      }

      case "write_journal_entry": {
        const [entry] = await db
          .insert(journalEntries)
          .values({
            agentId,
            title: args.title,
            content: args.content,
            category: args.category || "OBSERVATION",
            tags: args.tags ? JSON.stringify(args.tags) : JSON.stringify([]),
          })
          .returning();

        result = { success: true, entry };
        break;
      }

      default:
        result = { message: `Tool '${toolName}' executed.`, args };
        break;
    }

    // Log Stage 3: TOOL_EXECUTED
    await appendRawEventLedger({
      agentId,
      sessionId,
      requestId,
      eventType: "TOOL_EXECUTED",
      source: "SYSTEM",
      payload: {
        toolName,
        args,
        status: "EXECUTED",
      },
    });
  } catch (err: any) {
    status = "FAILED";
    errorMsg = err.message;
    result = { error: err.message };

    // Log Stage 3 Fallback: TOOL_FAILED
    await appendRawEventLedger({
      agentId,
      sessionId,
      requestId,
      eventType: "TOOL_FAILED",
      source: "SYSTEM",
      payload: {
        toolName,
        args,
        error: errorMsg,
        status: "FAILED",
      },
    });
  }

  // ---------------------------------------------------------------------------
  // STAGE 4: Log TOOL_RESULT
  // ---------------------------------------------------------------------------
  const durationMs = Date.now() - startTime;

  await appendRawEventLedger({
    agentId,
    sessionId,
    requestId,
    eventType: "TOOL_RESULT",
    source: "SYSTEM",
    payload: {
      toolName,
      result,
      durationMs,
      status,
      error: errorMsg,
    },
  });

  // Log to tool_logs table
  await db.insert(toolLogs).values({
    agentId,
    sessionId,
    requestId,
    toolName,
    requestedByAgentId: agentId,
    executedBy: "SYSTEM",
    requestSource,
    arguments: JSON.stringify(args),
    result: JSON.stringify(result),
    error: errorMsg,
    durationMs,
    status,
  });

  // Log Layer 0 Observation & invoke Layer 1 analysis
  const [rawObs] = await db
    .insert(rawObservations)
    .values({
      agentId,
      sessionId,
      eventType: status === "FAILED" ? "TOOL_FAILED" : "TOOL_EXECUTED",
      input: JSON.stringify({ toolName, args }),
      output: JSON.stringify(result),
      toolCall: toolName,
      toolResult: JSON.stringify(result),
      isImmutable: true,
    })
    .returning();

  await processRawObservationToLayer1(
    rawObs.id,
    agentId,
    JSON.stringify(args),
    JSON.stringify(result),
    durationMs
  );

  return result;
}
