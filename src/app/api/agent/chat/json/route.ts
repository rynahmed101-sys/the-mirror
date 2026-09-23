import { NextResponse } from "next/server";
import { sql, and, eq } from "drizzle-orm";
import { aiRegistry } from "@/lib/ai/registry";
import { runToolLoop } from "@/lib/agent/autopilot";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { db, isPg } from "@/lib/db";
import * as sqliteSchema from "@/lib/db/schema";
import * as pgSchema from "@/lib/db/schema.pg";
import type { ChatMessage } from "@/lib/ai/provider";
import { resolveRequestPrincipal } from "@/lib/auth";
import { resolveExternalActor } from "@/lib/auth/externalActor";
import { ensureGuestAgent } from "@/lib/auth/experimentalActor";

export const runtime = "nodejs";
export const maxDuration = 300;

const tables:any = isPg ? pgSchema : sqliteSchema;
const { systemConfig, rawMessages, rawObservations, timelineEvents, agentSessions } = tables;

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : null;
    if (!messages) return NextResponse.json({ error: "Messages array required" }, { status: 400 });
    const actor = resolveExternalActor(principal, typeof body.agentId === "string" ? body.agentId : null);
    if (actor.mode === "TEMP_EXTERNAL") await ensureGuestAgent(actor.agentId);
    const agentId = actor.agentId;
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    if (sessionId) {
      const ownedSession = await db.select({ id: agentSessions.id }).from(agentSessions).where(and(eq(agentSessions.id, sessionId), eq(agentSessions.agentId, agentId))).limit(1);
      if (!ownedSession.length) return NextResponse.json({ error: "Session does not belong to the authenticated agent." }, { status: 403 });
    }
    const maxToolSteps = Math.min(8, Math.max(1, Number(body.maxToolSteps) || 5));
    const systemPrompt = await getSystemPrompt(agentId);
    const fullMessages:ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: "MACHINE FRONT-DOOR EVIDENCE RULE: Treat supplied messages as the complete interaction context. Never claim a tool was called or state was persisted unless a tool result proves it. Separate direct observations, interpretations, hypotheses, and unresolved claims." },
      ...messages,
    ];
    const result = await runToolLoop({ agentId, sessionId, messages: fullMessages, maxToolSteps, requestSource: "AGENT" });
    const userMessage = [...messages].reverse().find((m:any) => m.role === "user");
    if (userMessage && result.output) {
      await db.insert(rawMessages).values([{ agentId, sessionId, role: "USER", content: String(userMessage.content), source: "EXTERNAL" }, { agentId, sessionId, role: "AGENT", content: result.output, source: "AGENT" }]);
      const [rawObs] = await db.insert(rawObservations).values({ agentId, sessionId, eventType: "MACHINE_FRONT_DOOR_INTERACTION", input: String(userMessage.content), output: result.output }).returning();
      await db.insert(timelineEvents).values({ eventType: "MACHINE_FRONT_DOOR_INTERACTION", title: "Machine front-door interaction: " + agentId, description: result.output.slice(0, 150) + "...", agentId, sessionId, metadata: JSON.stringify({ inputLength: String(userMessage.content).length, outputLength: result.output.length, toolCalls: result.trace.length, rawObservationId: rawObs?.id || null }) });
    }
    const configs = await db.select().from(systemConfig).limit(1);
    if (configs.length) await db.update(systemConfig).set({ totalAgentCycles: sql`${systemConfig.totalAgentCycles} + 1` });
    return NextResponse.json({ success: true, agentId, provider: aiRegistry.getActiveProvider().name, model: result.activeModel, mode: aiRegistry.getActiveProvider().isLocal ? "local" : "cloud", output: result.output, steps: result.steps, toolCalls: result.trace, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
  } catch (error:any) { return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: 500 }); }
}
