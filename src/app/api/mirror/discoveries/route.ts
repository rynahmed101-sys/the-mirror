import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";
const tables:any=isPg?pgSchema:sqliteSchema;
const { discoveries, timelineEvents }=tables;

export async function GET(req: Request) {
    const actor = await requireExperimentalActor(req, new URL(req.url).searchParams.get("agentId"));
  try {
    const list = await db
      .select()
      .from(discoveries)
      .where(eq(discoveries.agentId, actor.agentId))
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
    const { title, summary, epistemicStatus, evidence, implications, experimentId } = body;
    const actor = await requireExperimentalActor(req, typeof body.agentId === "string" ? body.agentId : null);

    if (!title || !summary) {
      return NextResponse.json({ error: "Title and summary required" }, { status: 400 });
    }

    const [disc] = await db
      .insert(discoveries)
      .values({
        agentId: actor.agentId,
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
      agentId: actor.agentId,
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
