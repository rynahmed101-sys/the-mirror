import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { db } from "@/lib/db";
import { agents, agentApiKeys } from "@/lib/db/schema.pg";
import { appendRawEventLedger } from "@/lib/agent/eventLedger";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control token required." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name, displayName, type, provider, model, permissions } = body;

    if (!name) {
      return NextResponse.json({ error: "Agent name required" }, { status: 400 });
    }

    const allowedProviders = new Set(["external", "ollama"]);
    if (provider && !allowedProviders.has(String(provider))) {
      return NextResponse.json({ error: "Only the Ollama provider is supported." }, { status: 400 });
    }

    const requestedPermissions = Array.isArray(permissions) ? permissions : ["RESEARCH_AGENT"];
    const allowedPermissions = new Set(["RESEARCH_AGENT", "READ_ONLY_MIRROR"]);
    if (requestedPermissions.some((p: unknown) => !allowedPermissions.has(String(p)))) {
      return NextResponse.json({ error: "Unsupported agent permission." }, { status: 400 });
    }

    const agentId = `agent_${nanoid(8)}`;
    const rawApiKey = `mirror_ak_${nanoid(24)}`;
    const apiKeyHash = await bcrypt.hash(rawApiKey, 10);
    const keyPrefix = rawApiKey.slice(0, 14);

    // Support scopes: READ_ONLY_MIRROR vs RESEARCH_AGENT
    const defaultPerms = requestedPermissions;

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
        model: model || "external-agent",
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

    // 3. Log AGENT_CONNECTED to cryptographic rawEventLedger
    await appendRawEventLedger({
      agentId,
      eventType: "AGENT_CONNECTED",
      source: "SYSTEM",
      payload: {
        agentId,
        name,
        type: agent.type,
        provider: agent.provider,
        model: agent.model,
        permissions: defaultPerms,
        keyPrefix,
      },
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
