import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { eq, count, sql, desc } from "drizzle-orm";
import { aiRegistry } from "@/lib/ai/registry";
import { getSupabaseMirrorStatus } from "@/lib/db/supabaseMirror";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { systemConfig, agents, selfModels, selfModelClaims, experiments, predictions, journalEntries, discoveries, toolLogs } = tables;

export async function GET() {
  try {
    const config = await db.select().from(systemConfig).limit(1);
    const stored = config[0];
    const runtime = aiRegistry.getActiveProvider();
    const runtimeName = aiRegistry.getActiveProviderName();
    const runtimeModel = aiRegistry.getActiveModel();
    const health = await aiRegistry.healthCheckFull(runtimeName);
    const secondaryMirror = await getSupabaseMirrorStatus();

    const [agentCount] = await db.select({ value: count() }).from(agents);
    const [latestModel] = await db.select().from(selfModels).orderBy(desc(selfModels.version)).limit(1);
    const claimCount = latestModel ? await db.select({ value: count() }).from(selfModelClaims).where(eq(selfModelClaims.selfModelId, latestModel.id)) : [{ value:0 }];
    const [activeExpCount] = await db.select({ value: count() }).from(experiments).where(sql`${experiments.status} != 'CONCLUDED'`);
    const [totalPredCount] = await db.select({ value: count() }).from(predictions);
    const [evalPredCount] = await db.select({ value: count() }).from(predictions).where(sql`${predictions.status} != 'PENDING'`);
    const [totalJournalCount] = await db.select({ value: count() }).from(journalEntries);
    const [totalDiscoveryCount] = await db.select({ value: count() }).from(discoveries);
    const [totalToolExecs] = await db.select({ value: count() }).from(toolLogs);

    return NextResponse.json({
      status:"ONLINE",
      timestamp:new Date().toISOString(),
      environment:{ name:"THE MIRROR — AI Self-Observation Laboratory", version:"1.1.0", mode:stored?.systemMode || "NORMAL" },
      aiRuntime:{
        provider:runtimeName,
        model:runtimeModel || stored?.activeModel || null,
        mode:runtime.isLocal ? "local" : "cloud",
        health:health.isHealthy ? "HEALTHY" : "UNREACHABLE",
        healthDetail:health.error || null,
      },
      secondaryMirror,
      stats:{
        agents:agentCount.value,
        selfModelVersion:latestModel?.version || 0,
        activeClaims:claimCount[0]?.value || 0,
        activeExperiments:activeExpCount.value,
        totalPredictions:totalPredCount.value,
        evaluatedPredictions:evalPredCount.value,
        journalEntries:totalJournalCount.value,
        discoveries:totalDiscoveryCount.value,
        totalToolExecutions:totalToolExecs.value,
        totalAgentCycles:stored?.totalAgentCycles || 0,
      },
    });
  } catch(error:any) {
    return NextResponse.json({ error:"Failed to fetch MIRROR status", details:error?.message || String(error) }, { status:500 });
  }
}