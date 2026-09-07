import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { predictions, timelineEvents } from "@/lib/db/schema.pg";
import { sql, eq } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(predictions)
      .orderBy(sql`${predictions.createdAt} DESC`);

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
    const { prediction, confidence, rationale, experimentId, agentId } = body;

    if (!prediction || confidence === undefined) {
      return NextResponse.json({ error: "Prediction text and confidence required" }, { status: 400 });
    }

    const [pred] = await db
      .insert(predictions)
      .values({
        agentId: agentId || "mirror-primary",
        experimentId: experimentId || null,
        prediction,
        confidence,
        rationale: rationale || null,
        status: "PENDING",
      })
      .returning();

    await db.insert(timelineEvents).values({
      eventType: "PREDICTION_MADE",
      title: `Prediction Logged (Confidence: ${Math.round(confidence * 100)}%)`,
      description: prediction,
      agentId: agentId || "mirror-primary",
      metadata: JSON.stringify({ predictionId: pred.id, confidence, experimentId }),
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
      .where(eq(predictions.id, predictionId))
      .returning();

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
