import { NextResponse } from "next/server";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";
import { PerturbationLabError, runPerturbationLab } from "@/lib/agent/perturbationLab";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = await requireExperimentalActor(req, typeof body.agentId === "string" ? body.agentId : null);
    return NextResponse.json(await runPerturbationLab({
      agentId: actor.agentId,
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
