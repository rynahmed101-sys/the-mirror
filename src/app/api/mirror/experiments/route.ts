import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experiments, predictions, timelineEvents } from "@/lib/db/schema.pg";
import { filterExperimentForAgent } from "@/lib/agent/blindIsolation";
import { sql, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") || req.headers.get("x-agent-id") || "mirror-primary";

    const list = await db
      .select()
      .from(experiments)
      .orderBy(sql`${experiments.createdAt} DESC`);

    const result: any[] = [];
    for (const exp of list) {
      const preds = await db
        .select()
        .from(predictions)
        .where(eq(predictions.experimentId, exp.id));

      const sanitized = filterExperimentForAgent(exp, agentId);

      result.push({
        ...sanitized,
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
    const { title, hypothesis, methodology, variables, isBlind, agentId, visibleConfig, hiddenConfig } = body;

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
        variables: variables ? (typeof variables === "string" ? variables : JSON.stringify(variables)) : null,
        status: "PROPOSED",
        isBlind: isBlind ?? false,
        visibleConfig: visibleConfig ? (typeof visibleConfig === "string" ? visibleConfig : JSON.stringify(visibleConfig)) : null,
        hiddenConfig: hiddenConfig ? (typeof hiddenConfig === "string" ? hiddenConfig : JSON.stringify(hiddenConfig)) : null,
      })
      .returning();

    await db.insert(timelineEvents).values({
      eventType: "EXPERIMENT_CREATED",
      title: `Experiment Proposed: ${title}`,
      description: isBlind ? "Experiment created under blind protocol." : hypothesis,
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
