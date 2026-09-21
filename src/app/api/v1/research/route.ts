import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentSessions, rawObservations } from "@/lib/db/schema.pg";
import { authenticateExternalAgent } from "@/lib/auth/externalAgent";
import { processRawObservationToLayer1 } from "@/lib/agent/analysisEngine";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET(req: Request) {
  const agent = await authenticateExternalAgent(req);
  if (!agent) return NextResponse.json({ error: "Bearer mirror_ak credential required" }, { status: 401 });
  const observations = await db.select().from(rawObservations)
    .where(eq(rawObservations.agentId, agent.id))
    .orderBy(desc(rawObservations.timestamp)).limit(100);
  const sessions = await db.select().from(agentSessions)
    .where(eq(agentSessions.agentId, agent.id))
    .orderBy(desc(agentSessions.lastActivityAt)).limit(20);
  return NextResponse.json({ agent, observations, sessions });
}

export async function POST(req: Request) {
  const agent = await authenticateExternalAgent(req);
  if (!agent) return NextResponse.json({ error: "Bearer mirror_ak credential required" }, { status: 401 });

  const body = await req.json();
  if (body.action === "start_session") {
    const [session] = await db.insert(agentSessions).values({ agentId: agent.id, status: "ACTIVE" }).returning();
    return NextResponse.json({ success: true, session });
  }

  if (body.action === "observation" || body.action === "prediction") {
    if (!body.eventType && body.action === "observation") {
      return NextResponse.json({ error: "eventType is required" }, { status: 400 });
    }
    const eventType = body.eventType || "EXTERNAL_PREDICTION";
    const [observation] = await db.insert(rawObservations).values({
      id: nanoid(),
      agentId: agent.id,
      eventType,
      input: typeof body.input === "object" ? JSON.stringify(body.input) : body.input,
      output: typeof body.output === "object" ? JSON.stringify(body.output) : body.output,
      prediction: body.prediction,
      actualResult: body.actualResult,
      isImmutable: true,
    }).returning();
    const analysis = await processRawObservationToLayer1(
      observation.id,
      agent.id,
      body.input || "",
      body.output || "",
    );
    return NextResponse.json({ success: true, layer0RawObservation: observation, layer1Analysis: analysis });
  }

  return NextResponse.json({ error: "action must be start_session, observation, or prediction" }, { status: 400 });
}
