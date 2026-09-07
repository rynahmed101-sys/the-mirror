import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentSessions, agents } from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, agentId, displayName, provider, model } = body;

    // Action: 'REGISTER_AGENT' or 'START_SESSION'
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
