import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runAutopilot } from "@/lib/agent/autopilot";

/**
 * POST /api/mirror/bot
 *
 * Protected autonomous research entrypoint. Defaults to ONE bounded cycle.
 * This is intentionally not public: hosted-model usage must never be an open relay.
 */
export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const requestedAgentId = typeof body.agentId === "string" ? body.agentId : "mirror-primary";
    if (principal.kind === "AGENT" && principal.agentId !== requestedAgentId) {
      return NextResponse.json({ error:"Forbidden: agent key may only run its own agent." }, { status:403 });
    }
    const result = await runAutopilot({
      agentId: requestedAgentId,
      objective: typeof body.objective === "string" ? body.objective : undefined,
      maxCycles: body.maxCycles,
      maxToolSteps: body.maxToolSteps,
    });

    return NextResponse.json({
      success: true,
      ...result,
      safety: { maxCycles: 20, defaultCycles: 1, maxToolSteps: 8 },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Mirror bot failed",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}