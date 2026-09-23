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
    if (mode === "projection" || mode === "full") out.projection = await runProjectionSuite({ agentIds: Array.isArray(body.agentIds) ? body.agentIds : ["mirror-primary"], maxTrials: Math.min(20, Math.max(1, Number(body.maxTrials) || 20)), maxToolSteps: Math.min(4, Math.max(1, Number(body.maxToolSteps) || 3)), seed: typeof body.seed === "string" ? body.seed : undefined });
    await appendRawEventLedger({ agentId: "mirror-primary", eventType: "INTERNAL_LAB_RUN_COMPLETED", source: "SYSTEM", payload: { mode, pass: true } });
    return NextResponse.json({ success: true, ...out, completedAt: new Date().toISOString() });
  } catch (error: any) {
    out.error = error?.message || String(error);
    if (error instanceof SimulationRunConflictError) { out.code = "SIMULATION_ALREADY_RUNNING"; out.agentId = error.agentId; out.sessionId = error.sessionId; }
    try { await appendRawEventLedger({ agentId: "mirror-primary", eventType: "INTERNAL_LAB_RUN_FAILED", source: "SYSTEM", payload: { mode, error: out.error } }); } catch {}
    return NextResponse.json({ success: false, ...out, completedAt: new Date().toISOString() }, { status: error instanceof SimulationRunConflictError ? 409 : 500 });
  }
}
