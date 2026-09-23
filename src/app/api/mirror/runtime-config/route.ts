import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { clearRuntimeSecret, getConfiguredOllamaApiKey, setRuntimeSecret } from "@/lib/config/runtimeSecrets";

export const runtime = "nodejs";

async function requireControl(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  return principal?.kind === "CONTROL";
}

export async function GET(req: Request) {
  if (!(await requireControl(req))) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const key = await getConfiguredOllamaApiKey();
  return NextResponse.json({
    provider: "ollama",
    configured: Boolean(key),
    source: process.env.OLLAMA_API_KEY && key === process.env.OLLAMA_API_KEY ? "environment" : key ? "encrypted_runtime_store" : "none",
    keyPreview: key ? "••••••••" + key.slice(-4) : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: Request) {
  if (!(await requireControl(req))) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.clear === true) {
      await clearRuntimeSecret("ollama_api_key");
      return NextResponse.json({ success: true, configured: Boolean(process.env.OLLAMA_API_KEY), clearedRuntimeOverride: true });
    }
    const value = typeof body.ollamaApiKey === "string" ? body.ollamaApiKey.trim() : "";
    if (!value) return NextResponse.json({ error: "ollamaApiKey is required, or send clear:true." }, { status: 400 });
    await setRuntimeSecret("ollama_api_key", value);
    return NextResponse.json({ success: true, configured: true, storage: "encrypted_runtime_store", keyPreview: "••••••••" + value.slice(-4) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
