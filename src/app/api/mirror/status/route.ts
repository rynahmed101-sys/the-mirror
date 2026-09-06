import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  systemConfig,
  agents,
  selfModels,
  selfModelClaims,
  experiments,
  predictions,
  journalEntries,
  discoveries,
  toolLogs,
} from "@/lib/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { aiRegistry } from "@/lib/ai/registry";

export async function GET() {
  try {
    const config = await db.select().from(systemConfig).limit(1);
    const activeConfig = config[0] || {
      activeProvider: "ollama",
      activeModel: "llama3.2:latest",
      systemMode: "NORMAL",
      totalAgentCycles: 0,
      totalToolCalls: 0,
    };

    const [agentCount] = await db.select({ value: count() }).from(agents);
    const [latestModel] = await db
      .select()
      .from(selfModels)
      .orderBy(sql`${selfModels.version} DESC`)
      .limit(1);

    const claimCount = latestModel
      ? await db
          .select({ value: count() })
          .from(selfModelClaims)
          .where(eq(selfModelClaims.selfModelId, latestModel.id))
      : [{ value: 0 }];

    const [activeExpCount] = await db
      .select({ value: count() })
      .from(experiments)
      .where(sql`${experiments.status} != 'CONCLUDED'`);

    const [totalPredCount] = await db.select({ value: count() }).from(predictions);
    const [evalPredCount] = await db
      .select({ value: count() })
      .from(predictions)
      .where(sql`${predictions.status} != 'PENDING'`);

    const [totalJournalCount] = await db.select({ value: count() }).from(journalEntries);
    const [totalDiscoveryCount] = await db.select({ value: count() }).from(discoveries);
    const [totalToolExecs] = await db.select({ value: count() }).from(toolLogs);

    // Check health of active provider
    let providerHealth = false;
    try {
      providerHealth = await aiRegistry.healthCheck(activeConfig.activeProvider);
    } catch {
      providerHealth = false;
    }

    return NextResponse.json({
      status: "ONLINE",
      timestamp: new Date().toISOString(),
      environment: {
        name: "THE MIRROR — AI Self-Observation Laboratory",
        version: "1.0.0",
        mode: activeConfig.systemMode,
      },
      aiRuntime: {
        provider: activeConfig.activeProvider,
        model: activeConfig.activeModel,
        health: providerHealth ? "HEALTHY" : "UNREACHABLE",
      },
      stats: {
        agents: agentCount.value,
        selfModelVersion: latestModel ? latestModel.version : 0,
        activeClaims: claimCount[0]?.value || 0,
        activeExperiments: activeExpCount.value,
        totalPredictions: totalPredCount.value,
        evaluatedPredictions: evalPredCount.value,
        journalEntries: totalJournalCount.value,
        discoveries: totalDiscoveryCount.value,
        totalToolExecutions: totalToolExecs.value,
        totalAgentCycles: activeConfig.totalAgentCycles,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch MIRROR status", details: error.message },
      { status: 500 }
    );
  }
}
