import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { db } from "@/lib/db";
import { systemConfig, timelineEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const body = await req.json();
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
