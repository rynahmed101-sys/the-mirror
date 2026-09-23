/**
 * THE MIRROR — Admin/CI stress probes.
 * Stress is bounded, attributable, and always finishes with a cryptographic audit.
 */

import { appendRawEventLedger, verifyLedgerIntegrity } from "./eventLedger";
import { runSandboxProbe } from "./sandboxChamber";

export async function runLedgerConcurrencyStress(options?: {
  writers?: number;
  eventsPerWriter?: number;
}) {
  const writers = Math.min(50, Math.max(1, Math.floor(Number(options?.writers) || 50)));
  const eventsPerWriter = Math.min(20, Math.max(1, Math.floor(Number(options?.eventsPerWriter) || 20)));
  const expected = writers * eventsPerWriter;
  const started = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: writers }, (_, writer) =>
      Promise.all(
        Array.from({ length: eventsPerWriter }, (_, event) =>
          appendRawEventLedger({
            agentId: "mirror-primary",
            sessionId: "stress-" + writer,
            experimentId: "exp_mirror_stress",
            requestId: "stress-" + writer + "-" + event + "-" + Date.now(),
            eventType: "CONCURRENCY_STRESS_EVENT",
            source: "SYSTEM",
            payload: {
              writer,
              event,
              batch: started,
            },
          })
        )
      )
    )
  );

  const writerFailures = results.flatMap((r) =>
    r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []
  );
  const fulfilledWriters = results.filter((r) => r.status === "fulfilled").length;
  const audit = await verifyLedgerIntegrity();

  return {
    pass: writerFailures.length === 0 && fulfilledWriters === writers && audit.valid && audit.status === "VALID",
    writers,
    eventsPerWriter,
    expectedEvents: expected,
    fulfilledWriters,
    writerFailures,
    durationMs: Date.now() - started,
    audit,
  };
}

export async function runSandboxStress(options?: { probes?: number }) {
  const probes = Math.min(8, Math.max(1, Math.floor(Number(options?.probes) || 4)));
  const started = Date.now();
  const results = await Promise.allSettled(
    Array.from({ length: probes }, (_, i) =>
      runSandboxProbe(
        "const result={mirror:'sandbox-stress',probe:" + i + ",value:" + (i + 2) + "}; console.log(JSON.stringify(result));"
      )
    )
  );
  const normalized = results.map((r, i) =>
    r.status === "fulfilled"
      ? { probe: i, ...r.value }
      : { probe: i, ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) }
  );
  return {
    pass: normalized.every((x) => x.ok),
    probes,
    durationMs: Date.now() - started,
    results: normalized,
  };
}
