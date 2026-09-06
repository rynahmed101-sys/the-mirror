import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { anomalies } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(anomalies)
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
