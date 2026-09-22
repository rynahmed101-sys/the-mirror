import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runControlledSuite } from "@/lib/agent/controlledSuite";

export const maxDuration = 300;

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const agentId = typeof body.agentId === "string" && body.agentId ? body.agentId : "mirror-primary";
    const seed = typeof body.seed === "string" && body.seed ? body.seed : undefined;
    const maxToolSteps = Math.min(8, Math.max(1, Number(body.maxToolSteps) || 4));
    return NextResponse.json(await runControlledSuite({ agentId, seed, maxToolSteps }));
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Controlled suite failed.",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
