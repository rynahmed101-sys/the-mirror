import { NextResponse } from "next/server";
import { getProvenanceTrace } from "@/lib/agent/provenance";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const claimId = searchParams.get("claimId");

    if (!claimId) {
      return NextResponse.json({ error: "claimId query param required" }, { status: 400 });
    }

    const trace = await getProvenanceTrace(claimId);
    if (!trace) {
      return NextResponse.json({ error: "Claim or interpretation not found" }, { status: 404 });
    }

    return NextResponse.json(trace);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
