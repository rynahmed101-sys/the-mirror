import { NextResponse } from "next/server";
import { resolveOllamaRuntimeConfig } from "@/lib/ai/ollama";

export async function GET() {
  const cfg = resolveOllamaRuntimeConfig(process.env);
  const keyPresent = Boolean(process.env.OLLAMA_API_KEY);
  let status: number | null = null;
  let body = "";
  let networkError: string | null = null;
  try {
    const res = await fetch(cfg.baseUrl + "/tags", {
      headers: cfg.cloud && keyPresent
        ? { Authorization: "Bearer " + process.env.OLLAMA_API_KEY }
        : {},
      signal: AbortSignal.timeout(8000),
    });
    status = res.status;
    body = (await res.text()).slice(0, 300);
  } catch (error) {
    networkError = error instanceof Error ? error.message : String(error);
  }
  return NextResponse.json({
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    cloud: cfg.cloud,
    keyPresent,
    status,
    body: body.replace(/Bearer\s+\S+/gi, "Bearer [redacted]"),
    networkError,
  });
}
