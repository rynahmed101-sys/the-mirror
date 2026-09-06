import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { db } from "@/lib/db";
import { systemConfig } from "@/lib/db/schema";

export async function GET() {
  try {
    const config = await db.select().from(systemConfig).limit(1);
    const activeConfig = config[0] || {
      activeProvider: "ollama",
      activeModel: "llama3.2:latest",
    };

    const providers = aiRegistry.listProviders();
    const availableModels: Array<{ provider: string; model: string; healthy: boolean }> = [];

    for (const providerId of providers) {
      const isHealthy = await aiRegistry.healthCheck(providerId);
      const models = await aiRegistry.listModels(providerId);
      for (const m of models) {
        availableModels.push({
          provider: providerId,
          model: m,
          healthy: isHealthy,
        });
      }
    }

    return NextResponse.json({
      activeProvider: activeConfig.activeProvider,
      activeModel: activeConfig.activeModel,
      providers,
      availableModels,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch model list", details: error.message },
      { status: 500 }
    );
  }
}
