/**
 * THE MIRROR — Tool Executor (Stage 3 Upgraded with True Tool Attribution)
 *
 * Enforces 3-Phase Decision Logging:
 * 1. Log TOOL_REQUESTED to raw_events
 * 2. Execute tool with true attribution (requestedBy, requestSource)
 * 3. Log TOOL_EXECUTED or TOOL_FAILED to raw_events and tool_logs
 */

import { db } from "../db";
import {
  rawEvents,
  rawObservations,
  toolLogs,
  selfModels,
  selfModelClaims,
  journalEntries,
  experiments,
  predictions,
  openQuestions,
  timelineEvents,
} from "../db/schema";
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
  let result: any = null;
  let status = "EXECUTED";
  let errorMsg: string | null = null;

  // 1. Log TOOL_REQUESTED Event to Immutable Raw Event Stream
  const [reqEvent] = await db
    .insert(rawEvents)
    .values({
      agentId,
      sessionId,
      eventType: "TOOL_REQUESTED",
      source: requestSource,
      input: JSON.stringify({ toolName, args }),
      metadata: JSON.stringify({ requestedBy: agentId, requestSource }),
      isImmutable: true,
    })
    .returning();

  try {
    switch (toolName) {
      case "get_raw_events": {
        const events = await db
          .select()
          .from(rawEvents)
          .orderBy(sql`${rawEvents.timestamp} DESC`)
          .limit(args.limit || 30);
        result = { count: events.length, events };
        break;
      }

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

        // Log SELF_MODEL_READ event
        await db.insert(rawEvents).values({
          agentId,
          sessionId,
          eventType: "SELF_MODEL_READ",
          source: requestSource,
          output: JSON.stringify(result),
        });
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
              supportingEvidence: args.supportingEvidence ? JSON.stringify(args.supportingEvidence) : null,
              counterevidence: args.counterevidence ? JSON.stringify(args.counterevidence) : null,
              selfReportedVsObserved: args.selfReportedVsObserved || "SELF_REPORTED",
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
              supportingEvidence: args.supportingEvidence ? JSON.stringify(args.supportingEvidence) : null,
              counterevidence: args.counterevidence ? JSON.stringify(args.counterevidence) : null,
              selfReportedVsObserved: args.selfReportedVsObserved || "SELF_REPORTED",
              status: "ACTIVE",
            })
            .returning();
          result = { success: true, newClaim };
        }

        await db.insert(rawEvents).values({
          agentId,
          sessionId,
          eventType: "SELF_MODEL_CHANGED",
          source: requestSource,
          input: JSON.stringify(args),
          output: JSON.stringify(result),
        });
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

        await db.insert(rawEvents).values({
          agentId,
          sessionId,
          experimentId: args.experimentId || null,
          eventType: "PREDICTION_CREATED",
          source: requestSource,
          input: JSON.stringify(args),
          output: JSON.stringify(pred),
        });

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

        await db.insert(rawEvents).values({
          agentId,
          sessionId,
          eventType: "JOURNAL_CREATED",
          source: requestSource,
          input: JSON.stringify(args),
          output: JSON.stringify(entry),
        });

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

    // 2. Log Tool Execution in toolLogs table with True Attribution
    await db.insert(toolLogs).values({
      agentId,
      sessionId,
      toolName,
      requestedBy: agentId,
      requestSource,
      arguments: JSON.stringify(args),
      result: JSON.stringify(result),
      error: errorMsg,
      durationMs,
      status,
    });

    // 3. Log TOOL_EXECUTED or TOOL_FAILED Event in rawEvents
    const [execEvent] = await db
      .insert(rawEvents)
      .values({
        agentId,
        sessionId,
        eventType: status === "FAILED" ? "TOOL_FAILED" : "TOOL_EXECUTED",
        source: requestSource,
        input: JSON.stringify({ toolName, args }),
        output: JSON.stringify(result),
        metadata: JSON.stringify({ requestId: reqEvent.id, durationMs, errorMsg }),
        isImmutable: true,
      })
      .returning();

    // 4. Log Raw Observation & Process Layer 1
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
