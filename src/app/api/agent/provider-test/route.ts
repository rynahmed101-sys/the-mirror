/**
 * THE MIRROR — Ollama Runtime Verification
 * GET returns runtime mode/model/health.
 * POST performs one real completion without exposing credentials.
 */
import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { resolveRequestPrincipal } from "@/lib/auth";
import { constrainAgentId } from "@/lib/auth/agentScope";

export const runtime = "nodejs";

async function authenticate(req: Request) {
  return resolveRequestPrincipal(req);
}

export async function GET(req: Request) {
  const principal = await authenticate(req);
  if (!principal) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  if (principal.kind !== "CONTROL") return NextResponse.json({ error:"Forbidden" }, { status:403 });
  const provider = aiRegistry.getActiveProvider();
  const health = await aiRegistry.healthCheckFull("ollama");
  return NextResponse.json({
    activeProvider:"ollama",
    activeModel:aiRegistry.getActiveModel(),
    mode:provider.isLocal ? "local" : "cloud",
    requiresApiKey:provider.requiresApiKey(),
    health,
    availableProviders:["ollama"],
    timestamp:new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const principal = await authenticate(req);\n  if (!principal) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : "Reply in one sentence confirming that the Mirror online runtime is reachable.";
  let agentId: string;
  try { agentId = constrainAgentId(principal, typeof body.agentId === "string" ? body.agentId : null) || "mirror-primary"; }
  catch (error:any) { return NextResponse.json({ error: "Forbidden: " + error.message }, { status:403 }); }
  const provider = aiRegistry.getActiveProvider();
  const start = Date.now();

  try {
    const response = await provider.complete([
      { role:"system", content:"You are a production verification assistant for THE MIRROR. Be concise, accurate, and never invent tool execution." },
      { role:"user", content:prompt }
    ], { temperature:0.2, maxTokens:256 });

    return NextResponse.json({
      success:true,
      provider:response.provider,
      model:response.model,
      mode:provider.isLocal ? "local" : "cloud",
      agentId,
      prompt,
      response:response.content,
      nonEmpty:response.content.trim().length > 0,
      inputTokens:response.inputTokens,
      outputTokens:response.outputTokens,
      finishReason:response.finishReason,
      latencyMs:Date.now() - start,
      timestamp:new Date().toISOString(),
    });
  } catch (error:any) {
    return NextResponse.json({
      success:false,
      provider:"ollama",
      mode:provider.isLocal ? "local" : "cloud",
      agentId,
      error:error?.message || String(error),
      latencyMs:Date.now() - start,
      timestamp:new Date().toISOString()
    }, { status:502 });
  }
}
