import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import { sql } from "drizzle-orm";
import { aiRegistry } from "@/lib/ai/registry";

export async function GET() {
  const provider = aiRegistry.getActiveProvider();
  const config = provider.validateConfig();
  let dbOk = false;
  let dbError: string | null = null;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error);
  }
  const health = await provider.healthCheck().catch((error) => ({
    isHealthy: false,
    latencyMs: 0,
    error: error instanceof Error ? error.message : String(error),
  }));
  return NextResponse.json({
    isPg,
    vercel: Boolean(process.env.VERCEL),
    provider: provider.name,
    model: aiRegistry.getActiveModel(),
    mode: provider.isLocal ? "local" : "cloud",
    configValid: config.valid,
    configErrors: config.errors,
    dbOk,
    dbError,
    aiHealthy: health.isHealthy,
    aiLatencyMs: health.latencyMs,
    aiError: health.error || null,
  });
}
