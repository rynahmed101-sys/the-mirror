import { NextResponse } from "next/server";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { runLabPlugins } from "@/lib/lab/plugins";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { agentSessions } = tables;

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = await requireExperimentalActor(req, typeof body.agentId === "string" ? body.agentId : null);
    const [session] = await db.insert(agentSessions).values({ agentId: actor.agentId, status: "ACTIVE" }).returning();
    try {
      const result = await runLabPlugins(Array.isArray(body.pluginIds) ? body.pluginIds.map(String) : undefined, {
        agentId: actor.agentId,
        sessionId: session.id,
        input: body.input && typeof body.input === "object" ? body.input : {},
      });
      return NextResponse.json({ success: true, actor, sessionId: session.id, ...result });
    } finally {
      await db.update(agentSessions).set({ status:"ENDED", endedAt:new Date(), lastActivityAt:new Date() }).where((await import("drizzle-orm")).eq(agentSessions.id, session.id));
    }
  } catch (error: any) {
    const message = error?.message || String(error);
    return NextResponse.json({ error: message }, { status: message === "Unauthorized" ? 401 : 400 });
  }
}
