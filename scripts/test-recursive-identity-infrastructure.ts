import Database from "better-sqlite3";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE runs (id TEXT PRIMARY KEY, total_iterations INTEGER NOT NULL, status TEXT NOT NULL);
  CREATE TABLE ledger (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    iteration_number INTEGER NOT NULL,
    parent_iteration_id TEXT,
    parent_question TEXT,
    question TEXT NOT NULL,
    UNIQUE(run_id, iteration_number)
  );
  CREATE TABLE workers (
    worker_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    last_heartbeat_at INTEGER NOT NULL,
    status TEXT NOT NULL
  );
  INSERT INTO runs VALUES ('run-test', 0, 'RUNNING');
`);

const commitCycle = db.transaction((iteration: number, crash = false) => {
  const run = db.prepare("SELECT * FROM runs WHERE id = 'run-test'").get() as { total_iterations: number };
  const parent = db.prepare(
    "SELECT id FROM ledger WHERE run_id = 'run-test' ORDER BY iteration_number DESC LIMIT 1",
  ).get() as { id: string } | undefined;
  const id = `cycle-${iteration}`;
  db.prepare(
    "INSERT INTO ledger (id, run_id, iteration_number, parent_iteration_id, parent_question, question) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, "run-test", iteration, parent?.id ?? null, "model supplied an intentionally wrong parent", `state-derived question ${iteration}`);
  if (crash) throw new Error("simulated provider/process crash before progress commit");
  const progress = db.prepare(
    "UPDATE runs SET total_iterations = total_iterations + 1 WHERE id = 'run-test' AND total_iterations = ?",
  ).run(iteration - 1);
  if (progress.changes !== 1) throw new Error("atomic progress guard rejected iteration");
});

for (let iteration = 1; iteration <= 5; iteration += 1) commitCycle(iteration);

let crashRejected = false;
try {
  commitCycle(6, true);
} catch {
  crashRejected = true;
}
const afterCrash = db.prepare("SELECT COUNT(*) AS count FROM ledger WHERE iteration_number = 6").get() as { count: number };
const runAfterCrash = db.prepare("SELECT total_iterations FROM runs WHERE id = 'run-test'").get() as { total_iterations: number };
commitCycle(6);

const rows = db.prepare(
  "SELECT * FROM ledger WHERE run_id = 'run-test' ORDER BY iteration_number",
).all() as Array<{ id: string; iteration_number: number; parent_iteration_id: string | null }>;
const lineageInvariant = rows.length === 6 && rows.every((row, index) =>
  index === 0 ? row.parent_iteration_id === null : row.parent_iteration_id === rows[index - 1].id);

let duplicateRejected = false;
try {
  commitCycle(6);
} catch {
  duplicateRejected = true;
}

const staleCutoff = Date.now() - 300000;
db.prepare("INSERT INTO workers VALUES (?, ?, ?, ?)").run("worker-crashed", "run-test", staleCutoff - 1, "RUNNING");
const stale = db.prepare(
  "UPDATE workers SET status = 'STALE' WHERE run_id = ? AND status = 'RUNNING' AND last_heartbeat_at < ?",
).run("run-test", staleCutoff);
db.prepare("UPDATE runs SET status = 'RECOVERABLE' WHERE id = ? AND status = 'RUNNING'").run("run-test");
const recovered = db.prepare("SELECT status FROM runs WHERE id = 'run-test'").get() as { status: string };

const report = {
  LINEAGE_INVARIANT: lineageInvariant,
  CRASH_RECOVERY: crashRejected && afterCrash.count === 0 && runAfterCrash.total_iterations === 5 && rows[5].iteration_number === 6,
  ATOMIC_COMMIT: afterCrash.count === 0 && runAfterCrash.total_iterations === 5,
  DUPLICATE_PROTECTION: duplicateRejected,
  STALE_WORKER_TRANSITION: stale.changes === 1 && recovered.status === "RECOVERABLE",
  committed_iterations: rows.map((row) => row.iteration_number),
  parent_iteration_ids: rows.map((row) => row.parent_iteration_id),
};

console.log(JSON.stringify(report, null, 2));
if (!report.LINEAGE_INVARIANT || !report.CRASH_RECOVERY || !report.ATOMIC_COMMIT || !report.DUPLICATE_PROTECTION || !report.STALE_WORKER_TRANSITION) {
  process.exitCode = 1;
}
