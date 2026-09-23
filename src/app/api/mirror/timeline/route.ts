import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";
const tables:any=isPg?pgSchema:sqliteSchema;
const { timelineEvents }=tables;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const actor = await requireExperimentalActor(req, searchParams.get("agentId"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

    const events = await db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.agentId, actor.agentId))
      .orderBy(sql`${timelineEvents.createdAt} DESC`)
      .limit(limit);

    return NextResponse.json(
      events.map((e) => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
      }))
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch timeline", details: error.message },
      { status: 500 }
    );
  }
}
