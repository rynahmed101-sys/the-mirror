import { NextResponse } from "next/server";
import { extractBearerToken, resolveApiPrincipal, validateControlToken } from "@/lib/auth";
import { resolveExternalActor } from "@/lib/auth/externalActor";
import { ensureGuestAgent } from "@/lib/auth/experimentalActor";
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

    let query = db.select().from(agentSessions).orderBy(desc(agentSessions.startedAt)).limit(limit);
    if (agentId) {
      query = db
        .select()
        .from(agentSessions)
        .where(eq(agentSessions.agentId, agentId))
        .orderBy(desc(agentSessions.startedAt))
        .limit(limit) as any;
    }

    const sessions = await query;
    return NextResponse.json(sessions);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  const principal = token ? await resolveApiPrincipal(token) : null;
  if (!principal) return NextResponse.json({ error:"Unauthorized" }, { status:401 });

  try {
    const body = await req.json();
    const { action, agentId, displayName, provider, model } = body;

    if (action === "REGISTER_AGENT") {
      if (principal.kind !== "CONTROL") {
        return NextResponse.json({ error:"Only admin control credentials may provision agents through this legacy action." }, { status:403 });
      }
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

      try {
        const actor = resolveExternalActor(principal, agentId);
        agentId = actor.agentId;
        if (actor.mode === "TEMP_EXTERNAL") await ensureGuestAgent(agentId);
      } catch (error:any) {
        return NextResponse.json({ error:"Forbidden: " + error.message }, { status:403 });
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
