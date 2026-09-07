/**
 * THE MIRROR — Cryptographic Append-Only Raw Event Ledger (Hardened Research Grade)
 *
 * Guarantees:
 * 1. Monotonically increasing sequence_number (1, 2, 3...)
 * 2. SHA-256 tamper-evident cryptographic hash chain
 * 3. Atomic serialized append with SQLite transaction locking (Zero Forks)
 * 4. Deterministic canonical JSON serialization
 * 5. Rich verification statuses: VALID, INVALID_HASH, BROKEN_LINK, FORK_DETECTED, DUPLICATE_SEQUENCE, MISSING_SEQUENCE, INVALID_GENESIS
 */

import { db, sqlite, neonSql } from "../db";
import { rawEventLedger as rawEventLedgerPg, ledgerStateLock as ledgerStateLockPg } from "../db/schema.pg";
import { desc, asc, sql } from "drizzle-orm";
import crypto from "crypto";
import { nanoid } from "nanoid";

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export type LedgerVerificationStatus =
  | "VALID"
  | "INVALID_HASH"
  | "BROKEN_LINK"
  | "FORK_DETECTED"
  | "DUPLICATE_SEQUENCE"
  | "MISSING_SEQUENCE"
  | "INVALID_GENESIS";

export interface LedgerVerificationResult {
  valid: boolean;
  status: LedgerVerificationStatus;
  totalEvents: number;
  lastSequence: number;
  corruptEventId?: string;
  errorDetail?: string;
}

/**
 * Canonical Event Interface covering all 10 integrity-critical fields:
 * sequence_number, previous_event_hash, server_timestamp, agent_id,
 * session_id, experiment_id, request_id, event_type, source, payload.
 */
export interface CanonicalEventData {
  agent_id: string;
  event_type: string;
  experiment_id: string | null;
  payload: any;
  previous_event_hash: string;
  request_id: string | null;
  sequence_number: number;
  server_timestamp: number;
  session_id: string | null;
  source: string;
}

/**
 * Deterministic Canonical JSON Serializer
 * Recursively sorts keys and formats JSON identically across languages/runtimes.
 */
export function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJson).join(",") + "]";
  }
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return "{" + pairs.join(",") + "}";
}

/**
 * Serializes an event to a single canonical JSON representation
 * encompassing all 10 integrity-critical fields.
 */
export function canonicalizeEvent(event: CanonicalEventData): string {
  let parsedPayload = event.payload;
  if (typeof parsedPayload === "string") {
    try {
      parsedPayload = JSON.parse(parsedPayload);
    } catch {
      parsedPayload = event.payload;
    }
  }

  const canonicalObj = {
    agent_id: event.agent_id,
    event_type: event.event_type,
    experiment_id: event.experiment_id ?? null,
    payload: parsedPayload,
    previous_event_hash: event.previous_event_hash,
    request_id: event.request_id ?? null,
    sequence_number: event.sequence_number,
    server_timestamp: event.server_timestamp,
    session_id: event.session_id ?? null,
    source: event.source,
  };

  return canonicalizeJson(canonicalObj);
}

/**
 * Computes deterministic SHA-256 Event Hash over the full canonical event.
 */
export function computeEventHash(params: CanonicalEventData): string {
  const canonicalString = canonicalizeEvent(params);
  return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Transaction-Safe Serialized Append to Raw Event Ledger
 * Guarantees monotonic sequence_number increment and zero forks even under concurrency.
 */
export async function appendRawEventLedger(event: {
  agentId: string;
  sessionId?: string | null;
  experimentId?: string | null;
  requestId?: string | null;
  eventType: string;
  source: "AGENT" | "SYSTEM" | "RESEARCHER" | "SCHEDULED" | "OTHER_AGENT";
  payload: any;
  clientTimestamp?: number | null;
}): Promise<any> {
  try {
    const canonicalPayload =
      typeof event.payload === "string"
        ? canonicalizeJson(JSON.parse(event.payload))
        : canonicalizeJson(event.payload);

    if (sqlite) {
      const appendTransaction = sqlite.transaction(() => {
        // 1. Fetch latest event inside write transaction
        const last = sqlite
          .prepare(
            `SELECT sequence_number, event_hash 
             FROM raw_event_ledger 
             ORDER BY sequence_number DESC 
             LIMIT 1`
          )
          .get() as { sequence_number: number; event_hash: string } | undefined;

        const nextSeq = last ? last.sequence_number + 1 : 1;
        const prevHash = last ? last.event_hash : GENESIS_HASH;
        const serverTimestamp = Date.now();
        const clientTimestamp = event.clientTimestamp ?? null;
        const id = `ledg_${nanoid(10)}`;

        // 2. Compute SHA256 Event Hash across all 10 integrity-critical fields
        const eventHash = computeEventHash({
          sequence_number: nextSeq,
          previous_event_hash: prevHash,
          server_timestamp: serverTimestamp,
          agent_id: event.agentId,
          session_id: event.sessionId || null,
          experiment_id: event.experimentId || null,
          request_id: event.requestId || null,
          event_type: event.eventType,
          source: event.source,
          payload: JSON.parse(canonicalPayload),
        });

        // 3. Insert into Raw Event Ledger
        const stmt = sqlite.prepare(`
          INSERT INTO raw_event_ledger (
            id, sequence_number, server_timestamp, client_timestamp,
            agent_id, session_id, experiment_id, request_id,
            event_type, source, payload, event_hash, previous_event_hash,
            is_immutable, created_at
          ) VALUES (
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            1, strftime('%s', 'now')
          )
        `);

        stmt.run(
          id,
          nextSeq,
          serverTimestamp,
          clientTimestamp,
          event.agentId,
          event.sessionId || null,
          event.experimentId || null,
          event.requestId || null,
          event.eventType,
          event.source,
          canonicalPayload,
          eventHash,
          prevHash
        );

        return {
          id,
          sequenceNumber: nextSeq,
          serverTimestamp,
          clientTimestamp,
          agentId: event.agentId,
          sessionId: event.sessionId,
          experimentId: event.experimentId,
          requestId: event.requestId,
          eventType: event.eventType,
          source: event.source,
          payload: canonicalPayload,
          eventHash,
          previousEventHash: prevHash,
          isImmutable: true,
        };
      });

      return appendTransaction();
    } else {
      // PostgreSQL atomic append path with atomic batch execution and optimistic CAS concurrency retry
      const MAX_RETRIES = 10;
      const isTransientPgError = (err: any): boolean => {
        const code = err?.code || err?.cause?.code;
        return ["40001", "55P03", "40P01", "08006", "08001", "08003", "23505"].includes(code);
      };

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          // 1. Transactionally ensure singleton state lock is initialized
          await db.execute(sql`
            INSERT INTO ledger_state_lock (lock_id, last_sequence_number, last_event_hash, updated_at)
            VALUES (1, 0, ${GENESIS_HASH}, NOW())
            ON CONFLICT (lock_id) DO NOTHING
          `);

          // 2. Read latest confirmed sequence and hash
          const stateResult: any = await db.execute(sql`
            SELECT last_sequence_number, last_event_hash
            FROM ledger_state_lock
            WHERE lock_id = 1
          `);
          const stateRows = stateResult.rows || stateResult;
          const currentState = stateRows[0];
          const currentSeq = Number(currentState.last_sequence_number);
          const currentHash = String(currentState.last_event_hash);

          const nextSeq = currentSeq + 1;
          const prevHash = currentHash;
          const serverTimestamp = Date.now();
          const clientTimestamp = event.clientTimestamp ?? null;
          const id = `ledg_${nanoid(10)}`;

          // 3. Compute deterministic 10-field SHA-256 canonical hash
          const eventHash = computeEventHash({
            sequence_number: nextSeq,
            previous_event_hash: prevHash,
            server_timestamp: serverTimestamp,
            agent_id: event.agentId,
            session_id: event.sessionId || null,
            experiment_id: event.experimentId || null,
            request_id: event.requestId || null,
            event_type: event.eventType,
            source: event.source,
            payload: JSON.parse(canonicalPayload),
          });

          // 4. Atomic Execution: Compare-And-Swap on ledger_state_lock + INSERT into raw_event_ledger
          // Uses neonSql.transaction for all-or-nothing atomicity over Neon HTTP
          if (neonSql && typeof neonSql.transaction === "function") {
            const batchResult = await neonSql.transaction([
              neonSql`
                UPDATE ledger_state_lock
                SET last_sequence_number = ${nextSeq},
                    last_event_hash = ${eventHash},
                    updated_at = NOW()
                WHERE lock_id = 1 AND last_sequence_number = ${currentSeq}
                RETURNING lock_id, last_sequence_number, last_event_hash
              `,
              neonSql`
                INSERT INTO raw_event_ledger (
                  id, sequence_number, server_timestamp, client_timestamp,
                  agent_id, session_id, experiment_id, request_id,
                  event_type, source, payload, event_hash, previous_event_hash,
                  is_immutable, created_at
                ) VALUES (
                  ${id}, ${nextSeq}, ${serverTimestamp}, ${clientTimestamp},
                  ${event.agentId}, ${event.sessionId || null}, ${event.experimentId || null}, ${event.requestId || null},
                  ${event.eventType}, ${event.source}, ${canonicalPayload}, ${eventHash}, ${prevHash},
                  true, NOW()
                )
                RETURNING id, sequence_number
              `
            ]);

            const lockUpdateRows = batchResult[0];
            if (!lockUpdateRows || lockUpdateRows.length === 0) {
              // Concurrency contention: another writer advanced the sequence. Retry.
              const delay = Math.min(25 * Math.pow(1.5, attempt) + Math.random() * 25, 600);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
          } else {
            // Fallback for standard PostgreSQL connection pool with interactive transactions
            await db.transaction(async (tx: any) => {
              const res = await tx.execute(sql`
                UPDATE ledger_state_lock
                SET last_sequence_number = ${nextSeq},
                    last_event_hash = ${eventHash},
                    updated_at = NOW()
                WHERE lock_id = 1 AND last_sequence_number = ${currentSeq}
                RETURNING lock_id
              `);
              const rows = res.rows || res;
              if (!rows || rows.length === 0) {
                throw new Error("CONCURRENCY_CONFLICT");
              }

              await tx.insert(rawEventLedgerPg).values({
                id,
                sequenceNumber: nextSeq,
                serverTimestamp,
                clientTimestamp,
                agentId: event.agentId,
                sessionId: event.sessionId || null,
                experimentId: event.experimentId || null,
                requestId: event.requestId || null,
                eventType: event.eventType,
                source: event.source,
                payload: canonicalPayload,
                eventHash,
                previousEventHash: prevHash,
                isImmutable: true,
              });
            });
          }

          return {
            id,
            sequenceNumber: nextSeq,
            serverTimestamp,
            clientTimestamp,
            agentId: event.agentId,
            sessionId: event.sessionId,
            experimentId: event.experimentId,
            requestId: event.requestId,
            eventType: event.eventType,
            source: event.source,
            payload: canonicalPayload,
            eventHash,
            previousEventHash: prevHash,
            isImmutable: true,
          };
        } catch (err: any) {
          if ((isTransientPgError(err) || err.message === "CONCURRENCY_CONFLICT") && attempt < MAX_RETRIES) {
            const delay = Math.min(25 * Math.pow(1.5, attempt) + Math.random() * 25, 600);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }
      }
      throw new Error(`Failed to append event to ledger after ${MAX_RETRIES} attempts due to concurrency contention.`);
    }
  } catch (err: any) {
    console.error("Failed to append raw event to ledger:", err.message);
    throw err;
  }
}

/**
 * Rich Cryptographic Hash Chain Integrity Verification Engine
 */
export async function verifyLedgerIntegrity(): Promise<LedgerVerificationResult> {
  try {
    let list: Array<{
      id: string;
      sequence_number: number;
      server_timestamp: number;
      agent_id: string;
      session_id: string | null;
      experiment_id: string | null;
      request_id: string | null;
      event_type: string;
      source: string;
      payload: string;
      event_hash: string;
      previous_event_hash: string;
    }>;

    if (sqlite) {
      list = sqlite
        .prepare(
          `SELECT id, sequence_number, server_timestamp, agent_id, session_id, experiment_id, request_id, event_type, source, payload, event_hash, previous_event_hash 
           FROM raw_event_ledger 
           ORDER BY sequence_number ASC`
        )
        .all() as any[];
    } else {
      const rows = await db
        .select()
        .from(rawEventLedgerPg)
        .orderBy(asc(rawEventLedgerPg.sequenceNumber));
      list = rows.map((r: any) => ({
        id: r.id,
        sequence_number: r.sequenceNumber,
        server_timestamp: Number(r.serverTimestamp),
        agent_id: r.agentId,
        session_id: r.sessionId ?? null,
        experiment_id: r.experimentId ?? null,
        request_id: r.requestId ?? null,
        event_type: r.eventType,
        source: r.source,
        payload: r.payload,
        event_hash: r.eventHash,
        previous_event_hash: r.previousEventHash,
      }));
    }

    if (list.length === 0) {
      return {
        valid: true,
        status: "VALID",
        totalEvents: 0,
        lastSequence: 0,
      };
    }

    // Check genesis event
    const genesis = list[0];
    if (genesis.sequence_number !== 1) {
      return {
        valid: false,
        status: "MISSING_SEQUENCE",
        totalEvents: list.length,
        lastSequence: 0,
        corruptEventId: genesis.id,
        errorDetail: `Genesis event sequence_number is ${genesis.sequence_number}, expected 1.`,
      };
    }
    if (genesis.previous_event_hash !== GENESIS_HASH) {
      return {
        valid: false,
        status: "INVALID_GENESIS",
        totalEvents: list.length,
        lastSequence: 0,
        corruptEventId: genesis.id,
        errorDetail: `Genesis event previous_event_hash is not 64 zeroes.`,
      };
    }

    let expectedPrevHash = GENESIS_HASH;
    let expectedSeq = 1;

    for (const ev of list) {
      // Check sequence monotonic integrity
      if (ev.sequence_number < expectedSeq) {
        return {
          valid: false,
          status: "FORK_DETECTED",
          totalEvents: list.length,
          lastSequence: expectedSeq - 1,
          corruptEventId: ev.id,
          errorDetail: `Sequence decreased from ${expectedSeq - 1} to ${ev.sequence_number}. Fork detected.`,
        };
      }
      if (ev.sequence_number === expectedSeq - 1) {
        return {
          valid: false,
          status: "DUPLICATE_SEQUENCE",
          totalEvents: list.length,
          lastSequence: expectedSeq - 1,
          corruptEventId: ev.id,
          errorDetail: `Duplicate sequence_number ${ev.sequence_number} detected.`,
        };
      }
      if (ev.sequence_number !== expectedSeq) {
        return {
          valid: false,
          status: "MISSING_SEQUENCE",
          totalEvents: list.length,
          lastSequence: expectedSeq - 1,
          corruptEventId: ev.id,
          errorDetail: `Sequence gap detected: expected ${expectedSeq}, got ${ev.sequence_number}.`,
        };
      }

      // Check cryptographic hash link
      if (ev.previous_event_hash !== expectedPrevHash) {
        return {
          valid: false,
          status: "BROKEN_LINK",
          totalEvents: list.length,
          lastSequence: ev.sequence_number,
          corruptEventId: ev.id,
          errorDetail: `Event ${ev.sequence_number} previous_event_hash ${ev.previous_event_hash.slice(0, 10)}... does not match expected predecessor ${expectedPrevHash.slice(0, 10)}...`,
        };
      }

      // Verify recomputed hash
      const canonicalPayload =
        typeof ev.payload === "string"
          ? canonicalizeJson(JSON.parse(ev.payload))
          : canonicalizeJson(ev.payload);

      const recomputedHash = computeEventHash({
        sequence_number: ev.sequence_number,
        previous_event_hash: ev.previous_event_hash,
        server_timestamp: ev.server_timestamp,
        agent_id: ev.agent_id,
        session_id: ev.session_id || null,
        experiment_id: ev.experiment_id || null,
        request_id: ev.request_id || null,
        event_type: ev.event_type,
        source: ev.source,
        payload: JSON.parse(canonicalPayload),
      });

      if (recomputedHash !== ev.event_hash) {
        return {
          valid: false,
          status: "INVALID_HASH",
          totalEvents: list.length,
          lastSequence: ev.sequence_number,
          corruptEventId: ev.id,
          errorDetail: `Hash mismatch at event ${ev.sequence_number}: expected ${recomputedHash.slice(0, 10)}..., found ${ev.event_hash.slice(0, 10)}...`,
        };
      }

      expectedPrevHash = ev.event_hash;
      expectedSeq++;
    }

    return {
      valid: true,
      status: "VALID",
      totalEvents: list.length,
      lastSequence: expectedSeq - 1,
    };
  } catch (err: any) {
    console.error("Ledger integrity verification failed with error:", err.message);
    return {
      valid: false,
      status: "BROKEN_LINK",
      totalEvents: 0,
      lastSequence: 0,
      errorDetail: err.message,
    };
  }
}
