import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { agents } = tables;

export async function GET(req: Request) {
  try {
    const actor = await requireExperimentalActor(req);
    const requestedAgentId = new URL(req.url).searchParams.get("agentId");
    const targetAgentId = actor.mode === "CONTROL" ? requestedAgentId : actor.agentId;
    let query = db.select().from(agents);
    if (actor.mode !== "CONTROL" || targetAgentId) {
      query = query.where(eq(agents.id, targetAgentId || actor.agentId)) as any;
    }
    const list = await query.orderBy(sql`${agents.createdAt} DESC`);

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
