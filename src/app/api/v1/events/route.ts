import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rawEvents } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const agentId = searchParams.get("agentId");
    const sessionId = searchParams.get("sessionId");
    const eventType = searchParams.get("eventType");

    let query = db.select().from(rawEvents);

    if (agentId) query = query.where(eq(rawEvents.agentId, agentId)) as any;
    if (sessionId) query = query.where(eq(rawEvents.sessionId, sessionId)) as any;
    if (eventType) query = query.where(eq(rawEvents.eventType, eventType)) as any;

    const events = await query.orderBy(sql`${rawEvents.timestamp} DESC`).limit(limit);

    return NextResponse.json(
      events.map((e) => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
