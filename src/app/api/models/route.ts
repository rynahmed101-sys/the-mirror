import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { resolveRequestPrincipal } from "@/lib/auth";
const tables:any=isPg?pgSchema:sqliteSchema;
const {systemConfig}=tables;

const ACTIVE_PROVIDER = "model-independent";
const ACTIVE_MODEL = "deterministic-cognitive-substrate";

export async function GET(req:Request) {
  const principal=await resolveRequestPrincipal(req);
  if(!principal||principal.kind!=="CONTROL") return NextResponse.json({error:"Admin access required."},{status:403});
  try {
    const config = await db.select().from(systemConfig).limit(1);
    const providers = aiRegistry.listProviders();
    const availableModels: Array<{ provider: string; model: string; healthy: boolean }> = [];
    for (const providerId of providers) {
      const isHealthy = await aiRegistry.healthCheck(providerId);
      const models = await aiRegistry.listModels(providerId);
      for (const m of models) availableModels.push({ provider: providerId, model: m, healthy: isHealthy });
    }
    return NextResponse.json({
      activeProvider: ACTIVE_PROVIDER,
      activeModel: ACTIVE_MODEL,
      persistedLegacyConfig: config[0]?.activeProvider && config[0].activeProvider !== ACTIVE_PROVIDER
        ? { provider: config[0].activeProvider, model: config[0].activeModel }
        : null,
      providers,
      availableModels,
    });
  } catch (error:any) {
    return NextResponse.json({error:"Failed to fetch model list",details:error.message},{status:500});
  }
}
