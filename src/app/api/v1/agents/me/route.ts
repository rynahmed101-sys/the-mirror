import { NextResponse } from "next/server";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import { eq } from "drizzle-orm";
import { resolveRequestPrincipal } from "@/lib/auth";
import { constrainAgentId } from "@/lib/auth/agentScope";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { agents } = tables;

export async function GET(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (principal.kind === "CONTROL") {
    return NextResponse.json({
      principal: { kind: principal.kind, tokenType: principal.tokenType },
      agent: null,
      message: "Control credential authenticated. Use an agent key to resolve an external agent identity.",
    });
  }

  const agentId = constrainAgentId(principal);
  const rows = await db.select().from(agents).where(eq(agents.id, agentId!)).limit(1);
  const agent = rows[0];
  if (!agent || !agent.isActive) {
    return NextResponse.json({ error: "Agent identity not found or inactive." }, { status: 404 });
  }

  return NextResponse.json({
    principal: { kind: principal.kind, agentId },
    agent: {
      id: agent.id,
      name: agent.name,
      displayName: agent.displayName,
      type: agent.type,
      role: agent.role,
      provider: agent.provider,
      model: agent.model,
      permissions: agent.permissions ? JSON.parse(agent.permissions) : [],
      status: agent.status,
      isActive: agent.isActive,
      lastSeenAt: agent.lastSeenAt,
    },
    capabilities: {
      chat: "POST /api/agent/chat",
      ollamaProbe: "POST /api/agent/provider-test",
      runStep: "POST /api/agent/run-step",
      startSession: "POST /api/v1/sessions",
      readEvents: "GET /api/v1/events",
    },
  });
}
