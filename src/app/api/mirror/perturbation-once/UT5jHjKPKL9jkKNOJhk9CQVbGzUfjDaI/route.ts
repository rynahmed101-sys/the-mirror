import { NextResponse } from "next/server";
import { runPerturbationLab } from "@/lib/agent/perturbationLab";

const NONCE = "UT5jHjKPKL9jkKNOJhk9CQVbGzUfjDaI";

export const maxDuration = 300;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ nonce: string }> },
) {
  const { nonce } = await params;
  if (nonce !== NONCE) return new NextResponse("Not found", { status: 404 });

  try {
    return NextResponse.json(await runPerturbationLab({
      agentId: "mirror-primary",
      polarIndex: 2,
      azimuthIndex: 7,
      epsilon: 1e-3,
      maxToolSteps: 4,
    }));
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "PERTURBATION_LAB_FAILED",
      details: error?.message || String(error),
      stage: error?.stage || null,
      code: error?.code || null,
    }, { status: error?.statusCode || 500 });
  }
}
