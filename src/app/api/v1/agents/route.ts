import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const list = await db
      .select()
      .from(agents)
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
