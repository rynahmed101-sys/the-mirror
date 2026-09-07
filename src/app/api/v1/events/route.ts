import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rawEventLedger } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const agentId = searchParams.get("agentId");
    const sessionId = searchParams.get("sessionId");
    const eventType = searchParams.get("eventType");

    let query = db.select().from(rawEventLedger);

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
