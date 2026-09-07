import { NextResponse } from "next/server";
import { getProvenanceTrace } from "@/lib/agent/provenance";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("targetId") || searchParams.get("claimId") || searchParams.get("experimentId");
    const agentId = searchParams.get("agentId") || req.headers.get("x-agent-id") || "mirror-primary";

    if (!targetId) {
      return NextResponse.json({ error: "targetId, claimId, or experimentId query param required" }, { status: 400 });
    }

    const trace = await getProvenanceTrace(targetId, agentId);
    if (!trace) {
      return NextResponse.json({ error: "Target entity not found in lineage" }, { status: 404 });
    }

    return NextResponse.json(trace);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
