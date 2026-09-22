import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { runSandboxProbe } from "@/lib/agent/sandboxChamber";
import { appendRawEventLedger } from "@/lib/agent/eventLedger";
import { requireExperimentalActor } from "@/lib/auth/experimentalActor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const actor = await requireExperimentalActor(req, typeof body.agentId === "string" ? body.agentId : null);
    const requestId = "sandbox_" + nanoid(10);
    const source = actor.mode === "CONTROL" ? "SYSTEM" : "AGENT";
    const code = typeof body.code === "string" && body.code.trim() ? body.code : undefined;

    await appendRawEventLedger({
      agentId: actor.agentId,
      requestId,
      eventType: "SANDBOX_PROBE_REQUESTED",
      source,
      payload: { requestedByMode: actor.mode, sourceLength: code ? code.length : 0, bounded: true },
    });

    try {
      const result = await runSandboxProbe(code);
      await appendRawEventLedger({
        agentId: actor.agentId,
        requestId,
        eventType: "SANDBOX_PROBE_COMPLETED",
        source: "SYSTEM",
        payload: { ok: result.ok, exitCode: result.exitCode, durationMs: result.durationMs, stdoutLength: result.stdout.length, stderrLength: result.stderr.length, sandboxName: result.sandboxName },
      });
      return NextResponse.json({ success: true, agentId: actor.agentId, requestId, ...result });
    } catch (error: any) {
      await appendRawEventLedger({
        agentId: actor.agentId,
        requestId,
        eventType: "SANDBOX_PROBE_FAILED",
        source: "SYSTEM",
        payload: { error: error?.message || String(error) },
      });
      return NextResponse.json({ success: false, agentId: actor.agentId, requestId, error: error?.message || String(error) }, { status: 502 });
    }
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) }, { status: error?.message === "Unauthorized" ? 401 : 403 });
  }
}
