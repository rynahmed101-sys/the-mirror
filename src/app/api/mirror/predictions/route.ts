import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { sql, eq, and } from "drizzle-orm";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { predictions, timelineEvents, experiments } = tables;

export async function GET(req: Request) {
  try {
    const actor = await requireExperimentalActor(req, new URL(req.url).searchParams.get("agentId"));
    let query = db.select().from(predictions);
    const requestedAgentId = new URL(req.url).searchParams.get("agentId");
    if (actor.mode !== "CONTROL") {
      query = query.where(eq(predictions.agentId, actor.agentId)) as any;
    } else if (requestedAgentId) {
      query = query.where(eq(predictions.agentId, requestedAgentId)) as any;
    }
    const list = await query.orderBy(sql`${predictions.createdAt} DESC`);

    // Calculate Brier score / accuracy metrics
    const evaluated = list.filter((p) => p.status !== "PENDING");
    let totalBrierError = 0;
    let correctCount = 0;

    for (const p of evaluated) {
      const outcomeVal = p.actualOutcome ? 1 : 0;
      const error = Math.pow(p.confidence - outcomeVal, 2);
      totalBrierError += error;
      if (
        (p.confidence >= 0.5 && p.actualOutcome) ||
        (p.confidence < 0.5 && !p.actualOutcome)
      ) {
        correctCount++;
      }
    }

    const meanBrierScore =
      evaluated.length > 0 ? (totalBrierError / evaluated.length).toFixed(4) : "N/A";
    const accuracy =
      evaluated.length > 0 ? ((correctCount / evaluated.length) * 100).toFixed(1) : "N/A";

    return NextResponse.json({
      predictions: list,
      metrics: {
        total: list.length,
        evaluated: evaluated.length,
        pending: list.length - evaluated.length,
        meanBrierScore,
        accuracyPercent: accuracy,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch predictions", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const actor = await requireExperimentalActor(req, typeof body.agentId === "string" ? body.agentId : null);
    const { prediction, confidence, rationale, experimentId } = body;
    const numericConfidence = Number(confidence);
    const agentId = actor.agentId;

    if (!prediction || confidence === undefined) {
      return NextResponse.json({ error: "Prediction text and confidence required" }, { status: 400 });
    }
    if (!Number.isFinite(numericConfidence) || numericConfidence < 0 || numericConfidence > 1) {
      return NextResponse.json({ error: "Confidence must be a number between 0 and 1." }, { status: 400 });
    }
    if (experimentId) {
      const ownedExperiment = await db
        .select({ id: experiments.id })
        .from(experiments)
        .where(and(eq(experiments.id, String(experimentId)), eq(experiments.agentId, agentId)))
        .limit(1);
      if (!ownedExperiment.length) {
        return NextResponse.json({ error: "Experiment does not belong to the authenticated agent." }, { status: 403 });
      }
    }

    const [pred] = await db
      .insert(predictions)
      .values({
        agentId,
        experimentId: experimentId || null,
        prediction,
        confidence: numericConfidence,
        rationale: rationale || null,
        status: "PENDING",
      })
      .returning();

    await db.insert(timelineEvents).values({
      eventType: "PREDICTION_MADE",
      title: `Prediction Logged (Confidence: ${Math.round(confidence * 100)}%)`,
      description: prediction,
      agentId: agentId || "mirror-primary",
      metadata: JSON.stringify({ predictionId: pred.id, confidence: numericConfidence, experimentId }),
    });

    return NextResponse.json({ success: true, prediction: pred });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create prediction", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const actor = await requireExperimentalActor(req, null);
    const { predictionId, actualOutcome, evaluationNotes } = body;

    if (!predictionId || actualOutcome === undefined) {
      return NextResponse.json({ error: "PredictionId and actualOutcome required" }, { status: 400 });
    }

    const isConfirmed = Boolean(actualOutcome);
    const newStatus = isConfirmed ? "CONFIRMED" : "REFUTED";

    const [updated] = await db
      .update(predictions)
      .set({
        actualOutcome: isConfirmed,
        evaluationNotes: evaluationNotes || null,
        status: newStatus,
        evaluatedAt: new Date(),
      })
      .where(and(eq(predictions.id, predictionId), eq(predictions.agentId, actor.agentId)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Prediction not found for the authenticated agent." }, { status: 404 });
    }

    await db.insert(timelineEvents).values({
      eventType: "PREDICTION_EVALUATED",
      title: `Prediction ${newStatus}`,
      description: updated.prediction,
      agentId: updated.agentId,
      metadata: JSON.stringify({
        predictionId,
        confidence: updated.confidence,
        actualOutcome: isConfirmed,
        status: newStatus,
      }),
    });

    return NextResponse.json({ success: true, prediction: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to evaluate prediction", details: error.message },
      { status: 500 }
    );
  }
}
