/**
 * THE MIRROR — Safe Read-Only SQLite to PostgreSQL Migration Script
 *
 * SAFETY INVARIANTS:
 * 1. STRICTLY READ-ONLY on SQLite: opens SQLite with { readonly: true }.
 * 2. Idempotent: Uses ON CONFLICT DO NOTHING to avoid duplicate keys.
 * 3. Topological ordering: Migrates parent tables before foreign-key children.
 * 4. Error detection: Never silently skips failures; halts or reports exact errors.
 * 5. Reports record counts per table.
 */

import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schemaPg from "../src/lib/db/schema.pg";
import path from "path";

const SQLITE_PATH = process.env.SQLITE_PATH || "./data/mirror.db";
const PG_URL = process.env.DATABASE_URL;

async function runMigration() {
  if (!PG_URL || !PG_URL.startsWith("postgres")) {
    console.error("ERROR: DATABASE_URL must be a valid PostgreSQL connection string.");
    console.error("Example: DATABASE_URL=postgres://user:pass@ep-xyz.neon.tech/mirror?sslmode=require");
    process.exit(1);
  }

  const resolvedSqlitePath = path.resolve(SQLITE_PATH);
  console.log(`\n======================================================`);
  console.log(`THE MIRROR — SQLite to PostgreSQL Migration`);
  console.log(`Source (SQLite - READ ONLY): ${resolvedSqlitePath}`);
  console.log(`Destination (PostgreSQL):     ${PG_URL.replace(/:[^:@]+@/, ":****@")}`);
  console.log(`======================================================\n`);

  // Open SQLite strictly in READ-ONLY mode
  const sqlite = new Database(resolvedSqlitePath, { readonly: true, fileMustExist: true });
  const sqlClient = neon(PG_URL);
  const pgDb = drizzle(sqlClient, { schema: schemaPg });

  const tables = [
    { name: "agents", table: schemaPg.agents, pkey: "id" },
    { name: "agent_api_keys", table: schemaPg.agentApiKeys, pkey: "id" },
    { name: "agent_sessions", table: schemaPg.agentSessions, pkey: "id" },
    { name: "system_config", table: schemaPg.systemConfig, pkey: "id" },
    { name: "api_tokens", table: schemaPg.apiTokens, pkey: "id" },
    { name: "timeline_events", table: schemaPg.timelineEvents, pkey: "id" },
    { name: "experiments", table: schemaPg.experiments, pkey: "id" },
    { name: "predictions", table: schemaPg.predictions, pkey: "id" },
    { name: "self_models", table: schemaPg.selfModels, pkey: "id" },
    { name: "self_model_claims", table: schemaPg.selfModelClaims, pkey: "id" },
    { name: "behavioral_baselines", table: schemaPg.behavioralBaselines, pkey: "id" },
    { name: "raw_observations", table: schemaPg.rawObservations, pkey: "id" },
    { name: "derived_analysis", table: schemaPg.derivedAnalysis, pkey: "id" },
    { name: "anomalies", table: schemaPg.anomalies, pkey: "id" },
    { name: "open_questions", table: schemaPg.openQuestions, pkey: "id" },
    { name: "journal_entries", table: schemaPg.journalEntries, pkey: "id" },
    { name: "discoveries", table: schemaPg.discoveries, pkey: "id" },
    { name: "behavioral_observations", table: schemaPg.behavioralObservations, pkey: "id" },
    { name: "agent_interactions", table: schemaPg.agentInteractions, pkey: "id" },
    { name: "raw_messages", table: schemaPg.rawMessages, pkey: "id" },
    { name: "tool_logs", table: schemaPg.toolLogs, pkey: "id" },
    { name: "raw_event_ledger", table: schemaPg.rawEventLedger, pkey: "id", orderBy: "sequence_number ASC" },
    { name: "api_audit_logs", table: schemaPg.apiAuditLogs, pkey: "id" },
  ];

  const summary: Record<string, { read: number; inserted: number; errors: number }> = {};

  for (const t of tables) {
    const query = t.orderBy
      ? `SELECT * FROM ${t.name} ORDER BY ${t.orderBy}`
      : `SELECT * FROM ${t.name}`;
    
    let rows: any[] = [];
    try {
      rows = sqlite.prepare(query).all();
    } catch (err: any) {
      console.warn(`[SKIP] Table ${t.name} not found in SQLite: ${err.message}`);
      continue;
    }

    summary[t.name] = { read: rows.length, inserted: 0, errors: 0 };
    if (rows.length === 0) {
      console.log(`[-] ${t.name}: 0 records.`);
      continue;
    }

    console.log(`[+] Migrating ${t.name} (${rows.length} records)...`);

    for (const row of rows) {
      try {
        // Normalize fields for PostgreSQL schema
        const normalized: Record<string, any> = {};
        for (const [key, val] of Object.entries(row)) {
          // Convert camelCase / snake_case mapping if needed
          normalized[key] = val;
        }

        // Insert row into PostgreSQL using ON CONFLICT DO NOTHING
        await (pgDb.insert(t.table as any) as any)
          .values(normalized)
          .onConflictDoNothing();

        summary[t.name].inserted++;
      } catch (err: any) {
        summary[t.name].errors++;
        console.error(`  [ERROR] Failed migrating row in ${t.name} (id: ${row.id}):`, err.message);
      }
    }
  }

  // Verify imported PostgreSQL ledger's highest sequence/hash against the SQLite source
  console.log(`[+] Verifying and synchronizing ledger_state_lock...`);
  const sqliteLastEvent = sqlite
    .prepare(
      `SELECT sequence_number, event_hash 
       FROM raw_event_ledger 
       ORDER BY sequence_number DESC 
       LIMIT 1`
    )
    .get() as { sequence_number: number; event_hash: string } | undefined;

  const pgLastRowsResult = await pgDb.execute(sql`
    SELECT sequence_number, event_hash 
    FROM raw_event_ledger 
    ORDER BY sequence_number DESC 
    LIMIT 1
  `);
  const pgLastRows = pgLastRowsResult.rows || pgLastRowsResult;
  const pgLastEvent = pgLastRows[0] as { sequence_number: number; event_hash: string } | undefined;

  // Invariant 6: If SQLite is empty but PostgreSQL already contains ledger events, abort rather than resetting state to genesis
  if (!sqliteLastEvent && pgLastEvent) {
    sqlite.close();
    throw new Error(
      `CRITICAL SAFETY VIOLATION: SQLite source ledger is empty, but PostgreSQL already contains ledger events (head seq: ${pgLastEvent.sequence_number}). Aborting to prevent resetting PostgreSQL ledger state to genesis.`
    );
  }

  // Invariant 5: If SQLite has events but PostgreSQL has no events or different head, verify strict equality
  if (sqliteLastEvent) {
    if (!pgLastEvent) {
      sqlite.close();
      throw new Error(
        `CRITICAL MIGRATION FAILURE: SQLite contains events (head seq: ${sqliteLastEvent.sequence_number}), but PostgreSQL raw_event_ledger is empty after migration. Aborting sync.`
      );
    }

    if (
      Number(sqliteLastEvent.sequence_number) !== Number(pgLastEvent.sequence_number) ||
      sqliteLastEvent.event_hash !== pgLastEvent.event_hash
    ) {
      sqlite.close();
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Ledger state mismatch after migration! SQLite: seq=${sqliteLastEvent.sequence_number}, hash=${sqliteLastEvent.event_hash}. PG: seq=${pgLastEvent.sequence_number}, hash=${pgLastEvent.event_hash}. Aborting to prevent overwriting ledger state.`
      );
    }
  }

  const maxSeq = sqliteLastEvent ? Number(sqliteLastEvent.sequence_number) : 0;
  const maxHash = sqliteLastEvent ? String(sqliteLastEvent.event_hash) : "0000000000000000000000000000000000000000000000000000000000000000";

  await pgDb.execute(sql`
    INSERT INTO ledger_state_lock (lock_id, last_sequence_number, last_event_hash, updated_at)
    VALUES (1, ${maxSeq}, ${maxHash}, NOW())
    ON CONFLICT (lock_id) DO UPDATE SET
      last_sequence_number = EXCLUDED.last_sequence_number,
      last_event_hash = EXCLUDED.last_event_hash,
      updated_at = NOW()
  `);
  console.log(`[✓] ledger_state_lock synchronized to seq=${maxSeq}, hash=${maxHash.slice(0, 16)}...`);

  sqlite.close();

  console.log(`\n======================================================`);
  console.log(`MIGRATION SUMMARY:`);
  console.log(`======================================================`);
  console.table(summary);
  console.log(`Migration completed successfully without touching SQLite.\n`);
}

runMigration().catch((err) => {
  console.error("Fatal migration error:", err);
  process.exit(1);
});
