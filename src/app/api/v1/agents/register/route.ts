import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agents, agentApiKeys, rawEvents } from "@/lib/db/schema";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, displayName, type, provider, model, permissions } = body;

    if (!name) {
      return NextResponse.json({ error: "Agent name required" }, { status: 400 });
    }

    const agentId = `agent_${nanoid(8)}`;
    const rawApiKey = `mirror_ak_${nanoid(24)}`;
    const apiKeyHash = await bcrypt.hash(rawApiKey, 10);
    const keyPrefix = rawApiKey.slice(0, 14);

    const defaultPerms = permissions || [
      "READ_STATE",
      "READ_SELF_MODEL",
      "READ_OBSERVATIONS",
      "READ_ANALYSIS",
      "READ_EXPERIMENTS",
      "READ_TIMELINE",
      "WRITE_OBSERVATION",
      "WRITE_JOURNAL",
      "WRITE_PREDICTION",
      "CREATE_EXPERIMENT",
      "REVISE_SELF_MODEL",
      "USE_TOOLS",
    ];

    // 1. Create Agent Record
    const [agent] = await db
      .insert(agents)
      .values({
        id: agentId,
        name,
        displayName: displayName || name,
        type: type || "EXTERNAL",
        role: "EXTERNAL_AGENT",
        provider: provider || "external",
        model: model || "unknown",
        permissions: JSON.stringify(defaultPerms),
        status: "ACTIVE",
        isActive: true,
        lastSeenAt: new Date(),
      })
      .returning();

    // 2. Create Hashed API Key Record
    await db.insert(agentApiKeys).values({
      agentId,
      apiKeyHash,
      keyPrefix,
    });

    // 3. Log AGENT_CONNECTED event in Raw Event Stream
    await db.insert(rawEvents).values({
      agentId,
      eventType: "AGENT_CONNECTED",
      source: "SYSTEM",
      input: JSON.stringify({ name, type, provider, model }),
      output: JSON.stringify({ agentId, keyPrefix }),
      isImmutable: true,
    });

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        provider: agent.provider,
        model: agent.model,
        permissions: defaultPerms,
      },
      apiKey: rawApiKey, // Exposed only once upon creation
      message: "Save this API key safely. It will not be shown again.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
