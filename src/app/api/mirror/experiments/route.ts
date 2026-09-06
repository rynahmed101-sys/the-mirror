import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experiments, predictions, timelineEvents } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(experiments)
      .orderBy(sql`${experiments.createdAt} DESC`);

    const result = [];
    for (const exp of list) {
      const preds = await db
        .select()
        .from(predictions)
        .where(eq(predictions.experimentId, exp.id));

      result.push({
        ...exp,
        variables: exp.variables ? JSON.parse(exp.variables) : null,
        predictionsCount: preds.length,
        predictions: preds,
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch experiments", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, hypothesis, methodology, variables, isBlind, agentId } = body;

    if (!title || !hypothesis) {
      return NextResponse.json({ error: "Title and hypothesis required" }, { status: 400 });
    }

    const expId = nanoid();
    const [exp] = await db
      .insert(experiments)
      .values({
        id: expId,
        agentId: agentId || "mirror-primary",
        title,
        hypothesis,
        methodology: methodology || "",
        variables: variables ? JSON.stringify(variables) : null,
        status: "PROPOSED",
        isBlind: isBlind ?? false,
      })
      .returning();

    await db.insert(timelineEvents).values({
      eventType: "EXPERIMENT_CREATED",
      title: `Experiment Proposed: ${title}`,
      description: hypothesis,
      agentId: agentId || "mirror-primary",
      metadata: JSON.stringify({ experimentId: expId, isBlind }),
    });

    return NextResponse.json({ success: true, experiment: exp });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create experiment", details: error.message },
      { status: 500 }
    );
  }
}
