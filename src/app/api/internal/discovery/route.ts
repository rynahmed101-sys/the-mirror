import { NextResponse } from "next/server";
import { runAutopilot } from "@/lib/agent/autopilot";
import { validateDiscoveryGrant } from "@/lib/research/discoveryGrant";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  if (process.env.MIRROR_AUTONOMOUS_DISCOVERY_ENABLED !== "1") return false;
  const expected = process.env.MIRROR_AUTONOMOUS_DISCOVERY_JOB_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === "Bearer " + expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "Autonomous discovery front door is disabled or unauthorized." },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const grant = validateDiscoveryGrant(body?.discoveryGrant);
    if (String(body?.correlationId || "") !== grant.correlation_id) {
      return NextResponse.json(
        { error: "Discovery grant correlation_id does not match the request." },
        { status: 400 },
      );
    }

    const maxToolSteps = Math.min(8, Math.max(1, Number(body?.maxToolSteps) || 6));
    const objective =
      typeof body?.objective === "string" && body.objective.trim()
        ? body.objective.trim()
        : "In idle discovery mode, investigate one promising mathematical or physical idea, challenge it with evidence, and propose at most one new capability candidate when justified.";

    const result = await runAutopilot({
      agentId: "mirror-primary",
      objective,
      maxCycles: 1,
      maxToolSteps,
      requestSource: "SCHEDULED",
      mode: "DISCOVERY",
      discoveryGrant: grant,
    });

    return NextResponse.json({
      success: true,
      grantId: grant.grant_id,
      correlationId: grant.correlation_id,
      status: "DISCOVERY_CYCLE_COMPLETED",
      result,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) },
      { status: 400 },
    );
  }
}
