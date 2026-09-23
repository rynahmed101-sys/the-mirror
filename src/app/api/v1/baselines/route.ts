import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { recalculateAgentBaselines } from "@/lib/agent/analysisEngine";
import { eq } from "drizzle-orm";
const tables:any = isPg ? pgSchema : sqliteSchema;
const { behavioralBaselines } = tables;

export async function GET(req: Request) {
    const actor = await requireExperimentalActor(req);
  try {
    // Refresh baselines before returning
    await recalculateAgentBaselines(actor.agentId);
    const list = await db.select().from(behavioralBaselines).where(eq(behavioralBaselines.agentId, actor.agentId));
    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
