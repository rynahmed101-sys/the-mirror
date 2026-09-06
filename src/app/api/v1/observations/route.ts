import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rawObservations, derivedAnalysis } from "@/lib/db/schema";
import { processRawObservationToLayer1 } from "@/lib/agent/analysisEngine";
import { sql, eq } from "drizzle-orm";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    const list = await db
      .select()
      .from(rawObservations)
      .orderBy(sql`${rawObservations.timestamp} DESC`)
      .limit(limit);

    const result = [];
    for (const raw of list) {
      const analysis = await db
        .select()
        .from(derivedAnalysis)
        .where(eq(derivedAnalysis.rawObservationId, raw.id))
        .limit(1);

      result.push({
        layer0: raw,
        layer1: analysis[0] || null,
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { agentId, eventType, input, output, toolCall, toolResult, prediction, actualResult } = body;

    if (!agentId || !eventType) {
      return NextResponse.json({ error: "agentId and eventType required" }, { status: 400 });
    }

    // 1. Create Immutable Layer 0 Raw Observation
    const [rawObs] = await db
      .insert(rawObservations)
      .values({
        agentId,
        eventType,
        input: typeof input === "object" ? JSON.stringify(input) : input,
        output: typeof output === "object" ? JSON.stringify(output) : output,
        toolCall: typeof toolCall === "object" ? JSON.stringify(toolCall) : toolCall,
        toolResult: typeof toolResult === "object" ? JSON.stringify(toolResult) : toolResult,
        prediction,
        actualResult,
        isImmutable: true,
      })
      .returning();

    // 2. Compute Machine-Derived Layer 1 Metrics
    const analysis = await processRawObservationToLayer1(
      rawObs.id,
      agentId,
      input || "",
      output || ""
    );

    return NextResponse.json({
      success: true,
      layer0RawObservation: rawObs,
      layer1Analysis: analysis,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
