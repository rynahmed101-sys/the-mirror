import { NextResponse } from "next/server";
import { extractBearerToken, validateApiToken } from "@/lib/auth";
import { runAutopilot } from "@/lib/agent/autopilot";

/**
 * POST /api/mirror/bot
 *
 * Protected autonomous research entrypoint. Defaults to ONE bounded cycle.
 * This is intentionally not public: hosted-model usage must never be an open relay.
 */
export async function POST(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token || !(await validateApiToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const result = await runAutopilot({
      agentId: typeof body.agentId === "string" ? body.agentId : "mirror-primary",
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