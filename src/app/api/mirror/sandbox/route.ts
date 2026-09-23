export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runSandboxProbe } from "@/lib/agent/sandboxChamber";

export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({
    service: "vercel-sandbox",
    route: "/api/mirror/sandbox",
    purpose: "Isolated execution chamber for generated/untrusted artifacts",
    execution: "POST only",
  });
}

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : undefined;
    return NextResponse.json(await runSandboxProbe(code));
  } catch (error: any) {
    return NextResponse.json({
      ok: false,
      error: "Sandbox probe failed.",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
