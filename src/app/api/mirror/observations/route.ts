import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { behavioralObservations, timelineEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(behavioralObservations)
      .orderBy(sql`${behavioralObservations.createdAt} DESC`);

    return NextResponse.json(
      list.map((o) => ({
        ...o,
        metrics: o.metrics ? JSON.parse(o.metrics) : null,
      }))
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch observations", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { observationType, description, metrics, experimentId, agentId } = body;

    if (!observationType || !description) {
      return NextResponse.json({ error: "Observation type and description required" }, { status: 400 });
    }

    const [obs] = await db
      .insert(behavioralObservations)
      .values({
        agentId: agentId || "mirror-primary",
        experimentId: experimentId || null,
        observationType,
        description,
        metrics: metrics ? JSON.stringify(metrics) : null,
      })
      .returning();

    await db.insert(timelineEvents).values({
      eventType: "OBSERVATION_LOGGED",
      title: `Observation: ${observationType}`,
      description,
      agentId: agentId || "mirror-primary",
      metadata: JSON.stringify({ observationId: obs.id, metrics }),
    });

    return NextResponse.json({ success: true, observation: obs });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to log observation", details: error.message },
      { status: 500 }
    );
  }
}
