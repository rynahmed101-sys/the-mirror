import { NextResponse } from "next/server";
import { revealExperiment } from "@/lib/agent/blindIsolation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let revealedBy = "RESEARCHER";
    try {
      const body = await req.json();
      if (body.revealedBy) revealedBy = body.revealedBy;
    } catch {
      // Empty body is fine
    }

    const result = await revealExperiment(id, revealedBy);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: `Experiment '${id}' successfully unsealed and revealed.`,
      experiment: result.experiment,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
