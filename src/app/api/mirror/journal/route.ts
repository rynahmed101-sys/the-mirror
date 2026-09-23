import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";
const tables:any=isPg?pgSchema:sqliteSchema;
const { journalEntries, timelineEvents }=tables;

export async function GET(req: Request) {
  const actor = await requireExperimentalActor(req, new URL(req.url).searchParams.get("agentId"));
  try {
    const entries = await db
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.agentId, actor.agentId))
      .orderBy(sql`${journalEntries.createdAt} DESC`);

    return NextResponse.json(
      entries.map((e) => ({
        ...e,
        tags: e.tags ? JSON.parse(e.tags) : [],
      }))
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch journal entries", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, content, category, tags } = body;
    const actor = await requireExperimentalActor(req, typeof body.agentId === "string" ? body.agentId : null);

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content required" }, { status: 400 });
    }

    const [entry] = await db
      .insert(journalEntries)
      .values({
        agentId: actor.agentId,
        title,
        content,
        category: category || "OBSERVATION",
        tags: tags ? JSON.stringify(tags) : JSON.stringify([]),
      })
      .returning();

    await db.insert(timelineEvents).values({
      eventType: "JOURNAL_ENTRY",
      title: `Journal: ${title}`,
      description: content.slice(0, 120) + "...",
      agentId: actor.agentId,
      metadata: JSON.stringify({ entryId: entry.id, category }),
    });

    return NextResponse.json({ success: true, entry });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to create journal entry", details: error.message },
      { status: 500 }
    );
  }
}
