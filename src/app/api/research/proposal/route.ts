import { NextResponse } from "next/server";
import { buildResearchProposal } from "@/lib/research/researchProposalBuilder";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  if (process.env.MIRROR_DISCOVERY_ENABLED !== "1") return false;
  const expected = process.env.MIRROR_DISCOVERY_JOB_TOKEN;
  if (!expected) return false;
  return req.headers.get("authorization") === "Bearer " + expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json(
      { error: "Discovery proposal endpoint is disabled or unauthorized." },
      { status: 403 },
    );
  }

  try {
    const body = await req.json();
    const proposal = buildResearchProposal({
      requestId: String(body?.requestId || "").trim(),
      capabilityId: String(body?.capabilityId || "").trim(),
      sourceRevision: body?.sourceRevision == null ? null : String(body.sourceRevision),
      candidateCapability: body?.candidateCapability,
      evidenceRefs: Array.isArray(body?.evidenceRefs) ? body.evidenceRefs.map(String) : [],
      assumptions: Array.isArray(body?.assumptions) ? body.assumptions.map(String) : [],
      risks: Array.isArray(body?.risks) ? body.risks.map(String) : [],
      limitations: Array.isArray(body?.limitations) ? body.limitations.map(String) : [],
    });

    return NextResponse.json(proposal, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || String(error) },
      { status: 400 },
    );
  }
}
