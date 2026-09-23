import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runProjectionSuite, getProjectionHistory, getProjectionRunState, PROJECTION_TRIALS } from "@/lib/agent/simulationProjection";
import { SimulationRunConflictError } from "@/lib/agent/simulationRunGuard";

export const maxDuration = 300;

export async function GET() {
  try {
    return NextResponse.json({
      suiteVersion: "1.0",
      chamberCount: PROJECTION_TRIALS.length,
      chambers: PROJECTION_TRIALS.map((x) => ({ key: x.key, chamber: x.chamber, target: x.target })),
      recent: await getProjectionHistory(30),
      runState: await getProjectionRunState(),
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
    const maxTrials = Math.min(6, Math.max(1, Number(body.maxTrials) || 4));
    const maxToolSteps = Math.min(3, Math.max(1, Number(body.maxToolSteps) || 2));
    const seed = typeof body.seed === "string" && body.seed ? body.seed : undefined;
    return NextResponse.json(await runProjectionSuite({ agentIds, maxTrials, maxToolSteps, seed }));
  } catch (error: any) {
    if (error instanceof SimulationRunConflictError) {
      return NextResponse.json({
        success: false,
        code: "SIMULATION_ALREADY_RUNNING",
        error: error.message,
        agentId: error.agentId,
        sessionId: error.sessionId,
      }, { status: 409 });
    }
    return NextResponse.json({
      success: false,
      error: "Projection suite failed.",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
