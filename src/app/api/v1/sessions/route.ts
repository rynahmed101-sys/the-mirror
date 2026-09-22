import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { agentSessions, agents } = tables;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));

    let query = db.select().from(agentSessions).orderBy(desc(agentSessions.createdAt)).limit(limit);
    if (agentId) {
      query = db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.agentId, agentId))
        .orderBy(desc(agentSessions.createdAt))
        .limit(limit) as any;
    }

    const sessions = await query;
    return NextResponse.json(sessions);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, agentId, displayName, provider, model } = body;

    if (action === "REGISTER_AGENT") {
      const id = agentId || `agent-${nanoid(6)}`;
      const [newAgent] = await db
        .insert(agents)
        .values({
          id,
          name: displayName || id,
          displayName: displayName || id,
          role: "EXTERNAL_AGENT",
          provider: provider || "external",
          model: model || "unknown",
          permissions: JSON.stringify([
            "READ_RAW",
            "READ_ANALYSIS",
            "READ_INTERPRETATION",
            "WRITE_OBSERVATION",
            "WRITE_PREDICTION",
            "WRITE_EXPERIMENT",
            "WRITE_JOURNAL",
          ]),
          isActive: true,
          lastSeenAt: new Date(),
        })
        .returning();

      return NextResponse.json({ success: true, agent: newAgent });
    }

    if (action === "START_SESSION") {
      if (!agentId) {
        return NextResponse.json({ error: "agentId required to start session" }, { status: 400 });
      }

      const [sess] = await db
        .insert(agentSessions)
        .values({
          agentId,
          status: "ACTIVE",
        })
        .returning();

      await db
        .update(agents)
        .set({ lastSeenAt: new Date() })
        .where(eq(agents.id, agentId));

      return NextResponse.json({ success: true, session: sess });
    }

    return NextResponse.json({ error: "Invalid session action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
