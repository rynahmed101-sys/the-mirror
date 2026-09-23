import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql } from "drizzle-orm";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { agents } = tables;

export async function GET(req: Request) {
  try {
    const actor = await requireExperimentalActor(req);
    const requestedAgentId = new URL(req.url).searchParams.get("agentId");
    const targetAgentId = actor.mode === "CONTROL" ? requestedAgentId : actor.agentId;
    const list = await db
      .select()
      .from(agents)
      .where(targetAgentId ? (await import("drizzle-orm")).eq(agents.id, targetAgentId) : undefined)
      .orderBy(sql`${agents.createdAt} DESC`);

    return NextResponse.json(
      list.map((a) => ({
        ...a,
        permissions: a.permissions ? JSON.parse(a.permissions) : [],
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
