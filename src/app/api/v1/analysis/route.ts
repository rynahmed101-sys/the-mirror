import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { sql, eq } from "drizzle-orm";
const tables:any = isPg ? pgSchema : sqliteSchema;
const { derivedAnalysis } = tables;

export async function GET(req: Request) {
    const actor = await requireExperimentalActor(req);
  try {
    const list = await db
      .select()
      .from(derivedAnalysis)
      .orderBy(sql`${derivedAnalysis.createdAt} DESC`)
      .where(eq(derivedAnalysis.agentId, actor.agentId)).orderBy(sql`${derivedAnalysis.createdAt} DESC`).limit(100);

    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
