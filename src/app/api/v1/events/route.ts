import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { sql, eq, and } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { rawEventLedger } = tables;
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
    const filters: SQL<unknown>[] = [];
    if (agentId) filters.push(eq(rawEventLedger.agentId, agentId));
    if (sessionId) filters.push(eq(rawEventLedger.sessionId, sessionId));
    if (eventType) filters.push(eq(rawEventLedger.eventType, eventType));
    if (filters.length) query = query.where(and(...filters)) as any;

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
