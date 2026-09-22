import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { PerturbationLabError, runPerturbationLab } from "@/lib/agent/perturbationLab";

export const maxDuration = 300;

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") {
    return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    return NextResponse.json(await runPerturbationLab({
      agentId: typeof body.agentId === "string" ? body.agentId : "mirror-primary",
      polarIndex: body.polarIndex,
      azimuthIndex: body.azimuthIndex,
      epsilon: body.epsilon,
      maxToolSteps: body.maxToolSteps,
    }));
  } catch (error: any) {
    const isLabError = error instanceof PerturbationLabError;
    return NextResponse.json({
      success: false,
      error: isLabError ? error.code : "PERTURBATION_LAB_FAILED",
      details: error?.message || String(error),
      stage: isLabError ? error.stage || null : null,
    }, { status: isLabError ? error.statusCode : 500 });
  }
}
