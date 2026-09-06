import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experiments, predictions, timelineEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const list = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);

    if (list.length === 0) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    const exp = list[0];
    const preds = await db.select().from(predictions).where(eq(predictions.experimentId, id));

    return NextResponse.json({
      ...exp,
      variables: exp.variables ? JSON.parse(exp.variables) : null,
      predictions: preds,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch experiment", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { status, results, conclusion, isBlind } = body;

    const list = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);
    if (list.length === 0) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    const current = list[0];
    const updates: any = {};
    if (status) updates.status = status;
    if (results !== undefined) updates.results = results;
    if (conclusion !== undefined) updates.conclusion = conclusion;
    if (isBlind !== undefined) updates.isBlind = isBlind;

    const [updated] = await db
      .update(experiments)
      .set(updates)
      .where(eq(experiments.id, id))
      .returning();

    await db.insert(timelineEvents).values({
      eventType: status === "CONCLUDED" ? "EXPERIMENT_CONCLUDED" : "EXPERIMENT_UPDATED",
      title: `Experiment ${status || "Updated"}: ${updated.title}`,
      description: conclusion || results || `Status changed to ${status}`,
      agentId: updated.agentId,
      metadata: JSON.stringify({ experimentId: id, status: updated.status }),
    });

    return NextResponse.json({ success: true, experiment: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to update experiment", details: error.message },
      { status: 500 }
    );
  }
}
