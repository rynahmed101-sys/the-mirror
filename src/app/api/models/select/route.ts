import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { resolveRequestPrincipal } from "@/lib/auth";
const tables:any=isPg?pgSchema:sqliteSchema;
const {systemConfig,timelineEvents}=tables;

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control token required." }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { provider, model } = body;

    if (!provider || !model) {
      return NextResponse.json({ error: "Provider and model required" }, { status: 400 });
    }

    aiRegistry.setActiveProvider(provider, model);

    const config = await db.select().from(systemConfig).limit(1);
    if (config.length > 0) {
      await db
        .update(systemConfig)
        .set({
          activeProvider: provider,
          activeModel: model,
          updatedAt: new Date(),
        })
        .where(eq(systemConfig.id, config[0].id));
    } else {
      await db.insert(systemConfig).values({
        activeProvider: provider,
        activeModel: model,
      });
    }

    await db.insert(timelineEvents).values({
      eventType: "MODEL_SWITCHED",
      title: `AI Model Switched to ${provider}:${model}`,
      description: `Active model updated to ${model} on provider ${provider}`,
      agentId: "system",
      metadata: JSON.stringify({ provider, model }),
    });

    return NextResponse.json({
      success: true,
      activeProvider: provider,
      activeModel: model,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to switch model", details: error.message },
      { status: 500 }
    );
  }
}
