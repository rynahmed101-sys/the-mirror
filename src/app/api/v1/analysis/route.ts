import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { derivedAnalysis, rawObservations } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(derivedAnalysis)
      .orderBy(sql`${derivedAnalysis.createdAt} DESC`)
      .limit(100);

    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
