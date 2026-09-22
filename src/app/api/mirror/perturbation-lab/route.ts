import { NextResponse } from "next/server";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runPerturbationLab } from "@/lib/agent/perturbationLab";

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
    return NextResponse.json({
      success: false,
      error: "Perturbation laboratory failed.",
      details: error?.message || String(error),
    }, { status: 500 });
  }
}
