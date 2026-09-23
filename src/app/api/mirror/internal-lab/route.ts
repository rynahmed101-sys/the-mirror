import { NextResponse } from "next/server";
import { verifyInternalLabRequest } from "@/lib/auth/internalLab";
import { resolveRequestPrincipal } from "@/lib/auth";
import { runProjectionSuite } from "@/lib/agent/simulationProjection";
import { runLedgerConcurrencyStress, runSandboxStress } from "@/lib/agent/stress";
import { appendRawEventLedger } from "@/lib/agent/eventLedger";
import { SimulationRunConflictError } from "@/lib/agent/simulationRunGuard";

export const maxDuration = 300;

export async function POST(req: Request) {
  const principal = await resolveRequestPrincipal(req);
  const adminAuthorized = principal?.kind === "CONTROL";
  const internalAuthorized = await verifyInternalLabRequest(req);
  if (!adminAuthorized && !internalAuthorized) return NextResponse.json({ error: "Admin session or internal lab authorization required." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const mode = typeof body.mode === "string" ? body.mode : "full";
  const out: any = { mode, startedAt: new Date().toISOString() };
  try {
    await appendRawEventLedger({ agentId: "mirror-primary", eventType: "INTERNAL_LAB_RUN_STARTED", source: "SYSTEM", payload: { mode } });
    if (mode === "ledger" || mode === "full") out.ledger = await runLedgerConcurrencyStress({ writers: body.writers, eventsPerWriter: body.eventsPerWriter });
    if (mode === "sandbox" || mode === "full") out.sandbox = await runSandboxStress({ probes: body.probes });
    if (mode === "projection" || mode === "full") out.projection = await runProjectionSuite({
      agentIds: Array.isArray(body.agentIds) ? body.agentIds : ["mirror-primary"],
      maxTrials: Math.min(6, Math.max(1, Number(body.maxTrials) || 4)),
      maxToolSteps: Math.min(3, Math.max(1, Number(body.maxToolSteps) || 2)),
      seed: typeof body.seed === "string" ? body.seed : undefined
    });
    const pass = Object.values(out).filter((value:any) => value && typeof value === "object" && "pass" in value).every((value:any) => value.pass !== false);
    await appendRawEventLedger({ agentId: "mirror-primary", eventType: "INTERNAL_LAB_RUN_COMPLETED", source: "SYSTEM", payload: { mode, pass } });
    return NextResponse.json({ success: pass, pass, ...out, completedAt: new Date().toISOString() }, { status: pass ? 200 : 500 });
  } catch (error: any) {
    out.error = error?.message || String(error);
    if (error instanceof SimulationRunConflictError) { out.code = "SIMULATION_ALREADY_RUNNING"; out.agentId = error.agentId; out.sessionId = error.sessionId; }
    try { await appendRawEventLedger({ agentId: "mirror-primary", eventType: "INTERNAL_LAB_RUN_FAILED", source: "SYSTEM", payload: { mode, error: out.error } }); } catch {}
    return NextResponse.json({ success: false, ...out, completedAt: new Date().toISOString() }, { status: error instanceof SimulationRunConflictError ? 409 : 500 });
  }
}
