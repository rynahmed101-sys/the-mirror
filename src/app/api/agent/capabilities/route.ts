import { NextResponse } from "next/server";
import { buildExternalAgentCapabilities } from "@/lib/agent/externalCapabilities";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return NextResponse.json(buildExternalAgentCapabilities(new URL(req.url).origin), {
    headers: { "Cache-Control": "no-store" },
  });
}
