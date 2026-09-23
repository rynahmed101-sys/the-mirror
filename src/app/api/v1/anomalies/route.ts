import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";
const tables:any = isPg ? pgSchema : sqliteSchema;
const { anomalies } = tables;

export async function GET(req: Request) {
    const actor = await requireExperimentalActor(req);
  try {
    const list = await db
      .select()
      .from(anomalies)
      .where(eq(anomalies.agentId, actor.agentId))
      .orderBy(sql`${anomalies.createdAt} DESC`);

    return NextResponse.json(
      list.map((a) => ({
        ...a,
        competingExplanations: a.competingExplanations ? JSON.parse(a.competingExplanations) : [],
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
