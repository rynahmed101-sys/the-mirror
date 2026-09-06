import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  systemConfig,
  agents,
  rawObservations,
  derivedAnalysis,
  selfModels,
  selfModelClaims,
  anomalies,
  openQuestions,
} from "@/lib/db/schema";
import { count, sql, eq } from "drizzle-orm";

export async function GET() {
  try {
    const config = await db.select().from(systemConfig).limit(1);
    const activeConfig = config[0] || {
      activeProvider: "ollama",
      activeModel: "llama3.2:latest",
      systemMode: "NORMAL",
    };

    const [agentCnt] = await db.select({ value: count() }).from(agents);
    const [rawCnt] = await db.select({ value: count() }).from(rawObservations);
    const [analysisCnt] = await db.select({ value: count() }).from(derivedAnalysis);
    const [anomalyCnt] = await db.select({ value: count() }).from(anomalies);
    const [openQCnt] = await db.select({ value: count() }).from(openQuestions);

    const [latestModel] = await db
      .select()
      .from(selfModels)
      .orderBy(sql`${selfModels.version} DESC`)
      .limit(1);

    const claimCnt = latestModel
      ? await db
          .select({ value: count() })
          .from(selfModelClaims)
          .where(eq(selfModelClaims.selfModelId, latestModel.id))
      : [{ value: 0 }];

    return NextResponse.json({
      status: "ONLINE",
      version: "2.0.0",
      architecture: "3-Layer Raw/Analysis/Interpretation",
      timestamp: new Date().toISOString(),
      aiRuntime: {
        provider: activeConfig.activeProvider,
        model: activeConfig.activeModel,
      },
      stats: {
        agents: agentCnt.value,
        layer0RawObservations: rawCnt.value,
        layer1DerivedMeasurements: analysisCnt.value,
        layer2SelfModelVersion: latestModel ? latestModel.version : 1,
        layer2ActiveClaims: claimCnt[0]?.value || 0,
        uninvestigatedAnomalies: anomalyCnt.value,
        openQuestions: openQCnt.value,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
