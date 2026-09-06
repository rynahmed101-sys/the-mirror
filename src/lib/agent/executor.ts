/**
 * THE MIRROR — Tool Executor (Final Architecture with 4-Stage Decision Sequence)
 *
 * Sequence:
 * 1. Log TOOL_REQUESTED to rawEventLedger (with request_id)
 * 2. Log AUTHORIZATION_CHECK to rawEventLedger
 * 3. Execute Tool
 * 4. Log TOOL_EXECUTED or TOOL_FAILED to rawEventLedger & tool_logs
 */

import { db } from "../db";
import {
  toolLogs,
  selfModels,
  selfModelClaims,
  journalEntries,
  experiments,
  predictions,
  rawObservations,
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
  const requestId = `req_${nanoid(8)}`;
  let result: any = null;
  let status = "EXECUTED";
  let errorMsg: string | null = null;

  // ---------------------------------------------------------------------------
  // STAGE 1: Log TOOL_REQUESTED event
  // ---------------------------------------------------------------------------
  await appendRawEventLedger({
    agentId,
    sessionId,
    requestId,
    eventType: "TOOL_REQUESTED",
    source: requestSource,
    payload: { toolName, args, requestedBy: agentId, requestSource },
  });

  // ---------------------------------------------------------------------------
  // STAGE 2: Log AUTHORIZATION_CHECK event
  // ---------------------------------------------------------------------------
  await appendRawEventLedger({
    agentId,
    sessionId,
    requestId,
    eventType: "AUTHORIZATION_CHECK",
    source: "SYSTEM",
    payload: { toolName, status: "AUTHORIZED", agentId },
  });

  // ---------------------------------------------------------------------------
  // STAGE 3: Execute Tool
  // ---------------------------------------------------------------------------
  try {
    switch (toolName) {
      case "get_self_model": {
        const latestModel = await db
          .select()
          .from(selfModels)
          .orderBy(sql`${selfModels.version} DESC`)
          .limit(1);

        if (latestModel.length === 0) {
          result = { version: 0, claims: [], message: "No self-model established." };
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
          .orderBy(sql`${selfModels.version} DESC`)
          .limit(1);

        if (latestModelList.length === 0) {
          result = { error: "No active self-model to revise." };
          break;
        }

        const currentModel = latestModelList[0];

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
            predictionType: args.predictionType || "BEHAVIOR",
            prediction: args.prediction,
            confidence: args.confidence,
            rationale: args.rationale || null,
            status: "PENDING",
          })
          .returning();

        result = { success: true, prediction: pred };
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
        result = { message: `Tool ${toolName} executed.`, args };
        break;
    }
  } catch (err: any) {
    status = "FAILED";
    errorMsg = err.message;
    result = { error: err.message };
  } finally {
    const durationMs = Date.now() - startTime;

    // -------------------------------------------------------------------------
    // STAGE 4: Log TOOL_EXECUTED or TOOL_FAILED event to rawEventLedger
    // -------------------------------------------------------------------------
    await appendRawEventLedger({
      agentId,
      sessionId,
      requestId,
      eventType: status === "FAILED" ? "TOOL_FAILED" : "TOOL_EXECUTED",
      source: requestSource,
      payload: { toolName, args, result, status, durationMs, errorMsg },
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

    // Log Raw Observation & Layer 1 analysis
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
  }

  return result;
}
