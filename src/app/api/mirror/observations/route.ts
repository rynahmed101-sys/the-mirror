import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";
const tables:any=isPg?pgSchema:sqliteSchema;
const {behavioralObservations,timelineEvents}=tables;

export async function GET(req:Request) {
    const actor=await requireExperimentalActor(req,new URL(req.url).searchParams.get("agentId"));
  try {
    const list = await db
      .select()
      .from(behavioralObservations)
      .where(eq(behavioralObservations.agentId,actor.agentId))
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
    const { observationType, description, metrics, experimentId } = body;
    const actor=await requireExperimentalActor(req,typeof body.agentId==="string"?body.agentId:null);

    if (!observationType || !description) {
      return NextResponse.json({ error: "Observation type and description required" }, { status: 400 });
    }

    const [obs] = await db
      .insert(behavioralObservations)
      .values({
        agentId: actor.agentId,
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
      agentId: actor.agentId,
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
