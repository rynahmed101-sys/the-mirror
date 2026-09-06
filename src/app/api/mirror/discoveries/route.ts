import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { discoveries, timelineEvents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(discoveries)
      .orderBy(sql`${discoveries.createdAt} DESC`);

    return NextResponse.json(
      list.map((d) => ({
        ...d,
        evidence: d.evidence ? JSON.parse(d.evidence) : [],
      }))
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch discoveries", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, summary, epistemicStatus, evidence, implications, experimentId, agentId } = body;

    if (!title || !summary) {
      return NextResponse.json({ error: "Title and summary required" }, { status: 400 });
    }

    const [disc] = await db
      .insert(discoveries)
      .values({
        agentId: agentId || "mirror-primary",
        experimentId: experimentId || null,
        title,
        summary,
        epistemicStatus: epistemicStatus || "HYPOTHESIS",
        evidence: evidence ? JSON.stringify(evidence) : JSON.stringify([]),
        implications: implications || null,
      })
      .returning();

    await db.insert(timelineEvents).values({
      eventType: "DISCOVERY_RECORDED",
      title: `Discovery: ${title}`,
      description: summary,
      agentId: agentId || "mirror-primary",
      metadata: JSON.stringify({ discoveryId: disc.id, epistemicStatus }),
    });

    return NextResponse.json({ success: true, discovery: disc });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to record discovery", details: error.message },
      { status: 500 }
    );
  }
}
