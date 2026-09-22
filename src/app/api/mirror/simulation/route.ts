import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runProjectionSuite, getProjectionHistory, PROJECTION_TRIALS } from "@/lib/agent/simulationProjection";

export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({
      suiteVersion: "1.0",
      chamberCount: PROJECTION_TRIALS.length,
      chambers: PROJECTION_TRIALS.map((x) => ({ key: x.key, chamber: x.chamber, target: x.target })),
      recent: await getProjectionHistory(30),
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Failed to read simulation history.", details: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const agentIds = Array.isArray(body.agentIds)
      ? body.agentIds.filter((x: unknown) => typeof x === "string" && x).slice(0, 4)
      : ["mirror-primary"];
    const maxTrials = Math.min(20, Math.max(1, Number(body.maxTrials) || 20));
    const maxToolSteps = Math.min(4, Math.max(1, Number(body.maxToolSteps) || 3));
    const seed = typeof body.seed === "string" && body.seed ? body.seed : undefined;
    return NextResponse.json(await runProjectionSuite({ agentIds, maxTrials, maxToolSteps, seed }));
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Projection suite failed.",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
