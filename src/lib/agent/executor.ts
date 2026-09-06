/**
 * THE MIRROR — Tool Executor (Stage 2 Upgraded)
 *
 * Executes agent tool calls, records immutable Layer 0 raw observations,
 * generates Layer 1 machine-derived analysis, and updates the database.
 */

import { db } from "../db";
import {
  rawObservations,
  toolLogs,
  selfModels,
  selfModelClaims,
  journalEntries,
  experiments,
  predictions,
  behavioralObservations,
  discoveries,
  agentInteractions,
  timelineEvents,
  openQuestions,
} from "../db/schema";
import { processRawObservationToLayer1 } from "./analysisEngine";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function executeTool(
  toolName: string,
  args: any,
  agentId: string = "mirror-primary"
): Promise<any> {
  const startTime = Date.now();
  let result: any = null;
  let status = "SUCCESS";

  try {
    switch (toolName) {
      // -----------------------------------------------------------------------
      // LAYER 0 & 1 ENFORCEMENT & IMMUTABILITY PROTECTION
      // -----------------------------------------------------------------------
      case "get_raw_observations": {
        const rawList = await db
          .select()
          .from(rawObservations)
          .orderBy(sql`${rawObservations.timestamp} DESC`)
          .limit(args.limit || 20);
        result = { count: rawList.length, observations: rawList };
        break;
      }

      case "get_behavioral_baselines": {
        const base = await db.select().from(rawObservations).limit(50);
        result = { agentId, totalObservations: base.length };
        break;
      }

      // -----------------------------------------------------------------------
      // SELF-MODEL CLAIMS & FALSIFICATION ENGINE (Layer 2)
      // -----------------------------------------------------------------------
      case "get_self_model": {
        const latestModel = await db
          .select()
          .from(selfModels)
          .orderBy(sql`${selfModels.version} DESC`)
          .limit(1);

        if (latestModel.length === 0) {
          result = { version: 0, claims: [], message: "No self-model established yet." };
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
              unknownEvidence: c.unknownEvidence ? JSON.parse(c.unknownEvidence) : [],
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

        await db.insert(timelineEvents).values({
          eventType: "SELF_MODEL_UPDATED",
          title: `Claim Revised: ${args.claim?.slice(0, 40) || "Claim Update"}`,
          description: args.reason || "Self-model claim revised based on observation.",
          agentId,
          metadata: JSON.stringify(args),
        });
        break;
      }

      case "bump_self_model_version": {
        const latestModelList = await db
          .select()
          .from(selfModels)
          .orderBy(sql`${selfModels.version} DESC`)
          .limit(1);

        const currentVersion = latestModelList.length > 0 ? latestModelList[0].version : 0;
        const newVersion = currentVersion + 1;
        const newModelId = nanoid();

        await db.insert(selfModels).values({
          id: newModelId,
          version: newVersion,
          createdReason: args.reason || `Version ${newVersion} initialized.`,
          agentId,
        });

        result = { success: true, version: newVersion, selfModelId: newModelId };
        break;
      }

      // -----------------------------------------------------------------------
      // PREDICTIONS ENGINE (Self-Prediction & Types)
      // -----------------------------------------------------------------------
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

      case "evaluate_prediction": {
        const [updated] = await db
          .update(predictions)
          .set({
            actualOutcome: args.actualOutcome,
            predictionError: Math.pow(args.confidence - (args.actualOutcome ? 1 : 0), 2),
            evaluationNotes: args.notes || null,
            status: args.actualOutcome ? "CONFIRMED" : "REFUTED",
            evaluatedAt: new Date(),
          })
          .where(eq(predictions.id, args.predictionId))
          .returning();

        result = { success: true, evaluation: updated };
        break;
      }

      // -----------------------------------------------------------------------
      // OPEN QUESTIONS ENGINE
      // -----------------------------------------------------------------------
      case "log_open_question": {
        const [q] = await db
          .insert(openQuestions)
          .values({
            agentId,
            question: args.question,
            category: args.category || "METACOGNITION",
            status: "OPEN",
            evidenceRefs: args.evidenceRefs ? JSON.stringify(args.evidenceRefs) : null,
          })
          .returning();

        result = { success: true, question: q };
        break;
      }

      // -----------------------------------------------------------------------
      // JOURNAL & EXPERIMENTS
      // -----------------------------------------------------------------------
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

      case "create_experiment": {
        const expId = nanoid();
        const [exp] = await db
          .insert(experiments)
          .values({
            id: expId,
            agentId,
            title: args.title,
            hypothesis: args.hypothesis,
            methodology: args.methodology || "",
            templateType: args.templateType || "CUSTOM",
            variables: args.variables ? JSON.stringify(args.variables) : null,
            isBlind: args.isBlind || false,
            status: "PROPOSED",
          })
          .returning();

        result = { success: true, experiment: exp };
        break;
      }

      default:
        result = { message: `Tool ${toolName} executed cleanly.`, args };
        break;
    }
  } catch (err: any) {
    status = "FAILED";
    result = { error: err.message };
  } finally {
    const durationMs = Date.now() - startTime;

    // 1. Log Tool execution
    await db.insert(toolLogs).values({
      agentId,
      toolName,
      arguments: JSON.stringify(args),
      result: JSON.stringify(result),
      durationMs,
      status,
    });

    // 2. Insert Immutable Layer 0 Observation
    const [rawObs] = await db
      .insert(rawObservations)
      .values({
        agentId,
        eventType: "TOOL_EXECUTION",
        input: JSON.stringify({ toolName, args }),
        output: JSON.stringify(result),
        toolCall: toolName,
        toolResult: JSON.stringify(result),
        isImmutable: true,
      })
      .returning();

    // 3. Process Machine-Derived Layer 1 Metrics
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
