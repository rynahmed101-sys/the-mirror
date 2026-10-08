import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { resolveRequestPrincipal } from "@/lib/auth";
const tables:any=isPg?pgSchema:sqliteSchema;
const {systemConfig,timelineEvents}=tables;

const ACTIVE_PROVIDER = "model-independent";
const ACTIVE_MODEL = "deterministic-cognitive-substrate";

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control token required." }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { provider, model } = body;
    if (provider !== ACTIVE_PROVIDER || model !== ACTIVE_MODEL) {
      return NextResponse.json({
        error: "Only the model-independent provider is enabled.",
        activeProvider: ACTIVE_PROVIDER,
        activeModel: ACTIVE_MODEL,
      }, { status: 400 });
    }
    aiRegistry.setActiveProvider(ACTIVE_PROVIDER, ACTIVE_MODEL);

    const config = await db.select().from(systemConfig).limit(1);
    if (config.length > 0) {
      await db.update(systemConfig).set({
        activeProvider: ACTIVE_PROVIDER,
        activeModel: ACTIVE_MODEL,
        updatedAt: new Date(),
      }).where(eq(systemConfig.id, config[0].id));
    } else {
      await db.insert(systemConfig).values({ activeProvider: ACTIVE_PROVIDER, activeModel: ACTIVE_MODEL });
    }

    await db.insert(timelineEvents).values({
      eventType: "MODEL_SWITCHED",
      title: "AI provider set to model-independent",
      description: "The active provider is the deterministic cognitive substrate; neural/cloud inference is disabled.",
      agentId: "system",
      metadata: JSON.stringify({ provider: ACTIVE_PROVIDER, model: ACTIVE_MODEL }),
    });
    return NextResponse.json({ success: true, activeProvider: ACTIVE_PROVIDER, activeModel: ACTIVE_MODEL });
  } catch (error:any) {
    return NextResponse.json({error:"Failed to set model-independent provider",details:error.message},{status:500});
  }
}
