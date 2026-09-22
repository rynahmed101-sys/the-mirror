import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rawEventLedger } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const requestedAgentId = searchParams.get("agentId");
    const sessionId = searchParams.get("sessionId");
    const actor = await requireExperimentalActor(req, requestedAgentId);
    const eventType = searchParams.get("eventType");

    let query = db.select().from(rawEventLedger);

    const agentId = actor.mode === "CONTROL" ? requestedAgentId : actor.agentId;
    if (agentId) query = query.where(eq(rawEventLedger.agentId, agentId)) as any;
    if (sessionId) query = query.where(eq(rawEventLedger.sessionId, sessionId)) as any;
    if (eventType) query = query.where(eq(rawEventLedger.eventType, eventType)) as any;

    const events = await query.orderBy(sql`${rawEventLedger.timestamp} DESC`).limit(limit);

    return NextResponse.json(
      events.map((e: any) => ({
        ...e,
        payload: e.payload ? JSON.parse(e.payload) : null,
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
