import { appendRawEventLedger, verifyLedgerIntegrity } from "../src/lib/agent/eventLedger";
import { isPg } from "../src/lib/db";

async function runPgConcurrencyTest() {
  console.log("=====================================================");
  console.log("THE MIRROR — PostgreSQL 50-Writer Concurrency Test");
  console.log(`Dialect: ${isPg ? "PostgreSQL (Neon)" : "SQLite"}`);
  console.log("====================================================\n");

  if (!isPg) {
    console.error("ERROR: Test must be run with DATABASE_DIALECT=postgres against Neon PostgreSQL.");
    process.exit(1);
  }

  const CONCURRENT_WRITERS = 50;
  console.log(`[+] Spawning ${CONCURRENT_WRITERS} simultaneous concurrent event appends...`);

  const startTime = Date.now();
  const appendPromises = Array.from({ length: CONCURRENT_WRITERS }, (_, idx) => {
    return appendRawEventLedger({
      agentId: `agent_bench_${idx.toString().padStart(3, "0")}`,
      sessionId: `sess_bench_${idx}`,
      experimentId: "exp_concurrency_bench",
      requestId: `req_bench_${idx}_${Date.now()}`,
      eventType: "CONCURRENCY_STRESS_EVENT",
      source: "AGENT",
      payload: {
        writerIndex: idx,
        batchTimestamp: startTime,
        metric: Math.random(),
      },
    });
  });

  const results = await Promise.allSettled(appendPromises);
  const duration = (Date.now() - startTime) / 1000;

  const rejected = results.filter((r) => r.status === "rejected");
  const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];

  console.log(`[+] Completed ${CONCURRENT_WRITERS} concurrent writes in ${duration.toFixed(2)}s`);
  console.log(`    Fulfilled: ${fulfilled.length} / ${CONCURRENT_WRITERS}`);
  console.log(`   Rejected:  ${rejected.length} / ${CONCURRENT_WRITERS}`);

  if (rejected.length > 0) {
    console.error("[-] FAIL: One or more writers failed during concurrent append:");
    rejected.forEach((rej, idx) => console.error(`   Writer error ${idx}: `, (rej as any).reason));
    process.exit(1);
  }

  // Verify sequences returned to callers are distinct
  const returnedSeqs = fulfilled.map((f) => f.value.sequenceNumber).sort((a: number, b: number) => a - b);
  const uniqueSeqs = new Set(returnedSeqs);

  console.log(`[+] Checking caller return uniqueness...`);
  if (uniqueSeqs.size !== CONCURRENT_WRITERS) {
    console.error(`[-] FAIL: Duplicate sequence numbers returned to callers! Total: ${returnedSeqs.length}, Unique: ${uniqueSeqs.size}`);
    process.exit(1);
  }
  console.log(`[+] All ${CONCURRENT_WRITERS} callers received unique sequence numbers.`);

  // Run full ledger cryptographic integrity audit
  console.log(`[+] Running end-to-end cryptographic ledger audit (verifyLedgerIntegrity)...`);
  const audit = await verifyLedgerIntegrity();
  console.log("    Ledger audit result:", audit);

  if (!audit.valid || audit.status !== "VALID") {
    console.error(`[-] FAIL: Cryptographic audit failed! Status: ${audit.status}, Error: ${audit.errorDetail}`);
    process.exit(1);
  }

  console.log(`\n====================================================`);
  console.log(`[+] SUCCESS: 50-writer PostgreSQL concurrency test PASSED!`);
  console.log(`   Total events: ${audit.totalEvents}`);
  console.log(`AFinal sequence: ${audit.lastSequence}`);
  console.log("    Zero forks, zero gaps, zero duplicate sequence numbers.");
  console.log("===================================================\n");
}

runPgConcurrencyTest().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
