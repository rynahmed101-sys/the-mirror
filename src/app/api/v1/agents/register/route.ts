import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { appendRawEventLedger } from "@/lib/agent/eventLedger";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const tables:any = isPg ? pgSchema : sqliteSchema;
const { agents, agentApiKeys } = tables;

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);

  try {
    const body = await req.json();
    const { name, displayName, type, provider, model, permissions } = body;
    const requestedType = String(type || "EXTERNAL").toUpperCase();
    const requestedProvider = String(provider || "external").toLowerCase();

    if (!name) {
      return NextResponse.json({ error: "Agent name required" }, { status: 400 });
    }

    const allowedProviders = new Set(["external", "ollama"]);
    if (requestedProvider && !allowedProviders.has(requestedProvider)) {
      return NextResponse.json({ error: "Only the Ollama provider is supported." }, { status: 400 });
    }

    if (!principal && requestedType !== "EXTERNAL") {
      return NextResponse.json({ error: "Unauthenticated self-registration is limited to EXTERNAL agents." }, { status: 403 });
    }
    if (principal?.kind === "AGENT" || principal?.kind === "TEMP_EXTERNAL") {
      return NextResponse.json({ error: "External agents do not provision other agents. Use this endpoint without a credential to create your own persistent identity." }, { status: 403 });
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
        type: requestedType,
        role: "EXTERNAL_AGENT",
        provider: requestedProvider,
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
