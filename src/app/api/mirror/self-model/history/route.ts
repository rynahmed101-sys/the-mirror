import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { selfModels, selfModelClaims } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const history = await db
      .select()
      .from(selfModels)
      .orderBy(sql`${selfModels.version} DESC`);

    const result: any[] = [];
    for (const m of history) {
      const claims = await db
        .select()
        .from(selfModelClaims)
        .where(sql`${selfModelClaims.selfModelId} = ${m.id}`);

      result.push({
        id: m.id,
        version: m.version,
        createdReason: m.createdReason,
        createdAt: m.createdAt,
        agentId: m.agentId,
        claimCount: claims.length,
        claims: claims.map((c) => ({
          ...c,
          contradictions: c.contradictions ? JSON.parse(c.contradictions) : null,
        })),
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch self-model history", details: error.message },
      { status: 500 }
    );
  }
}
