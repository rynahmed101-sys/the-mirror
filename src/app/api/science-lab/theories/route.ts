import { NextResponse } from "next/server";
import { listTheories } from "@/lib/science/registry";
import { listScienceRuns } from "@/lib/science/persistence";
import { resolveRequestPrincipal } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  if (!principal || principal.kind !== "CONTROL") return NextResponse.json({ error: "Admin session or control credential required." }, { status: 403 });
  return NextResponse.json({
    service: "science-lab",
    role: "experimental mathematics and physics evaluation",
    calculationOwner: "external-math-physics-suite",
    theories: listTheories(),
    recentRuns: await listScienceRuns(20),
  }, { headers: { "Cache-Control": "no-store" } });
}
