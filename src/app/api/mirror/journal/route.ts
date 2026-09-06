import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { journalEntries, timelineEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const entries = await db
      .select()
      .from(journalEntries)
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
    const { title, content, category, tags, agentId } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "Title and content required" }, { status: 400 });
    }

    const [entry] = await db
      .insert(journalEntries)
      .values({
        agentId: agentId || "mirror-primary",
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
      agentId: agentId || "mirror-primary",
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
