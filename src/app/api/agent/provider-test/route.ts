/**
 * THE MIRROR — Ollama Runtime Verification
 * GET returns runtime mode/model/health.
 * POST performs one real completion without exposing credentials.
 */
import { NextResponse } from "next/server";
import { aiRegistry } from "@/lib/ai/registry";
import { extractBearerToken, validateApiToken } from "@/lib/auth";

async function authenticate(req: Request): Promise<boolean> {
  const token = extractBearerToken(req.headers.get("Authorization"));
  return !!token && await validateApiToken(token);
}

export async function GET(req: Request) {
  if (!(await authenticate(req))) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
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
  if (!(await authenticate(req))) return NextResponse.json({ error:"Unauthorized" }, { status:401 });
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" && body.prompt.trim() ? body.prompt.trim() : "Reply in one sentence confirming that the Mirror online runtime is reachable.";
  const agentId = typeof body.agentId === "string" ? body.agentId : "mirror-primary";
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
