import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runScienceSandbox } from "@/lib/science/sandbox";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ service: "science-lab-sandbox", execution: "ephemeral Vercel Sandbox microVM", network: "deny-all", purpose: "pre-validation of unverified mathematical/physics scripts" });
}

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await runScienceSandbox(typeof body.source === "string" ? body.source : ""));
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: "Science sandbox failed.", details: error?.message || String(error) }, { status: 400 });
  }
}
