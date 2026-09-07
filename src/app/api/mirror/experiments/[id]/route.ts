import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { experiments, predictions, timelineEvents } from "@/lib/db/schema";
import { canAgentAccessExperimentConfig, canAgentAccessExperimentConfigAsync, filterExperimentForAgent } from "@/lib/agent/blindIsolation";
import { eq } from "drizzle-orm";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId") || req.headers.get("x-agent-id") || "mirror-primary";
    const requestHidden = searchParams.get("includeHidden") === "true" || searchParams.get("field") === "hidden_config";

    const list = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);

    if (list.length === 0) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    const exp = list[0];

    // If explicit attempt to retrieve hidden config while blind, strictly deny with 403
    if (requestHidden && exp.isBlind && !(await canAgentAccessExperimentConfigAsync(agentId, id))) {
      return NextResponse.json(
        {
          error: "AUTHORIZATION_DENIED",
          status: "DENIED",
          reason: `BLIND_ISOLATION_ENFORCED: Agent '${agentId}' is denied access to hidden configuration of blind experiment '${id}' before explicit reveal.`,
        },
        { status: 403 }
      );
    }

    const preds = await db.select().from(predictions).where(eq(predictions.experimentId, id));
    const sanitized = filterExperimentForAgent(exp, agentId);

    return NextResponse.json({
      ...sanitized,
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
