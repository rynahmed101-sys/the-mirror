import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rawEventLedger } from "@/lib/db/schema";
import { verifyLedgerIntegrity } from "@/lib/agent/eventLedger";
import { sql, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const verify = searchParams.get("verify") === "true";
    const agentId = searchParams.get("agentId");

    if (verify) {
      const status = await verifyLedgerIntegrity();
      return NextResponse.json(status);
    }

    let query = db.select().from(rawEventLedger);
    if (agentId) query = query.where(eq(rawEventLedger.agentId, agentId)) as any;

    const events = await query.orderBy(sql`${rawEventLedger.createdAt} DESC`).limit(limit);

    return NextResponse.json(
      events.map((e) => ({
        ...e,
        payload: e.payload ? JSON.parse(e.payload) : null,
      }))
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
