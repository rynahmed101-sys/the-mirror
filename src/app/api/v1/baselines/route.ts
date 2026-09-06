import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { behavioralBaselines } from "@/lib/db/schema";
import { recalculateAgentBaselines } from "@/lib/agent/analysisEngine";

export async function GET() {
  try {
    // Refresh baselines before returning
    await recalculateAgentBaselines("mirror-primary");
    const list = await db.select().from(behavioralBaselines);
    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
