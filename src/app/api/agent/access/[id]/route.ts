import { NextResponse } from "next/server";
import { ensureGuestAgent } from "@/lib/auth/experimentalActor";
import { runLabPlugins, listLabPlugins } from "@/lib/lab/plugins";
import { resolveMirrorAccessLink } from "@/lib/agent/accessLinks";
import { runToolLoop } from "@/lib/agent/autopilot";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { aiRegistry } from "@/lib/ai/registry";
import type { ChatMessage } from "@/lib/ai/provider";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { agentSessions } = tables;

export const runtime = "nodejs";
export const maxDuration = 300;

async function capability(req: Request, id: string) {
  const link = await resolveMirrorAccessLink(id);
  if (!link) return null;
  return { link, origin: new URL(req.url).origin };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await capability(req, id);
  if (!result) return NextResponse.json({ error: "Access link invalid, expired, or revoked." }, { status: 404 });
  return NextResponse.json({
    protocol: "mirror-link-capability/1",
    capability: {
      id: result.link.id,
      label: result.link.label,
      agentId: result.link.agentId,
      scope: result.link.scope,
      expiresAt: result.link.expiresAt,
    },
    actions: [
      { method: "GET", path: "/api/agent/access/" + id, action: "describe" },
      { method: "POST", path: "/api/agent/access/" + id, action: "chat", body: { action: "chat", messages: "ChatMessage[]" } },
      { method: "POST", path: "/api/agent/access/" + id, action: "lab", body: { action: "lab", pluginIds: "string[] | omitted for all" } },
      { method: "POST", path: "/api/agent/access/" + id, action: "provider_test", body: { action: "provider_test" } },
    ],
    notes: [
      "The URL is an opaque, expirable, revocable capability link, not the controller credential.",
      "State-changing work remains POST. GET only describes the capability.",
      "The built-in Ollama runtime remains server-side.",
      "No hidden chain-of-thought is returned; the interface exposes structured outcomes and tool traces only.",
    ],
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await capability(req, id);
  if (!result) return NextResponse.json({ error: "Access link invalid, expired, or revoked." }, { status: 404 });

  const agentId = result.link.agentId;
  await ensureGuestAgent(agentId);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "chat");

  if (action === "provider_test") {
    const health = await aiRegistry.getActiveProvider().healthCheck();
    return NextResponse.json({ success: health.isHealthy, runtime: health, model: aiRegistry.getActiveModel() });
  }

  if (action === "lab") {
    const [session] = await db.insert(agentSessions).values({ agentId, status: "ACTIVE" }).returning();
    const pluginIds = Array.isArray(body.pluginIds) ? body.pluginIds.map(String) : undefined;
    const resultSet = await runLabPlugins(pluginIds, { agentId, sessionId: session.id, input: body.input || {} });
    return NextResponse.json({ success: true, ...resultSet });
  }

  if (action !== "chat") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : [];
  if (!messages.length) return NextResponse.json({ error: "messages[] is required." }, { status: 400 });
  const [session] = await db.insert(agentSessions).values({ agentId, status: "ACTIVE" }).returning();
  const maxToolSteps = Math.min(8, Math.max(1, Number(body.maxToolSteps) || 6));
  const resultSet = await runToolLoop({
    agentId,
    sessionId: session.id,
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "LAB ACCESS SEQUENCE: observe → retrieve_knowledge → think → visualize → challenge → act → record → evaluate. Keep internal reasoning private; return concise, evidence-backed outputs." },
      ...messages,
    ],
    maxToolSteps,
    requestSource: "AGENT",
  });
  return NextResponse.json({
    success: true,
    sessionId: session.id,
    agentId,
    model: resultSet.activeModel,
    output: resultSet.output,
    steps: resultSet.steps,
    toolTrace: resultSet.trace.map((entry: any) => ({ tool: entry.tool, status: entry.result?.status || "complete" })),
  });
}
