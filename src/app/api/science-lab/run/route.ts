import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { resolveRequestPrincipal } from "@/lib/auth";
import { getTheory } from "@/lib/science/registry";
import { evaluateTheory } from "@/lib/science/evaluator";
import { saveScienceRun } from "@/lib/science/persistence";
import type { TheoryCase } from "@/lib/science/baseTheory";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const theory = getTheory(typeof body.theoryId === "string" ? body.theoryId : "");
    if (!theory) return NextResponse.json({ error: "Unknown theory adapter." }, { status: 404 });
    const cases = Array.isArray(body.cases) ? body.cases.slice(0, 500) as TheoryCase[] : [];
    const runId = nanoid();
    const result = await evaluateTheory(theory, cases, runId);
    await saveScienceRun({ runId, theory: theory.metadata, metrics: result.metrics, stability: result.stability, cases: result.cases });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: "Science evaluation failed.", details: error?.message || String(error) }, { status: 400 });
  }
}
