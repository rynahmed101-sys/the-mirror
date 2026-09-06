import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { timelineEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    const events = await db
      .select()
      .from(timelineEvents)
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
