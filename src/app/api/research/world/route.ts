import { NextResponse } from "next/server";
import { researchWorld, type ResearchProvider } from "@/lib/research/worldResearch";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const expected = process.env.MIRROR_RESEARCH_JOB_TOKEN;
  if (!expected) return false;
  const actual = req.headers.get("authorization") || "";
  return actual === "Bearer " + expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Research job endpoint is disabled or unauthorized." }, { status: 403 });
  }

  try {
    const body = await req.json();
    const query = String(body?.query || "").trim();
    if (!query || query.length > 500) {
      return NextResponse.json({ error: "query must contain 1-500 characters." }, { status: 400 });
    }

    const providers = Array.isArray(body?.providers)
      ? body.providers.map(String).filter((p: string) => ["crossref", "openalex", "arxiv", "github", "huggingface"].includes(p))
      : undefined;

    const results = await researchWorld({
      query,
      providers: providers as ResearchProvider[] | undefined,
      limit: Number(body?.limit),
      correlationId: String(body?.correlationId || "chanfana-research"),
    });

    return NextResponse.json({
      schema_version: "mirror.research_result.v1",
      authority: "UNTRUSTED_EXTERNAL_EVIDENCE",
      results,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || String(error) }, { status: 400 });
  }
}
