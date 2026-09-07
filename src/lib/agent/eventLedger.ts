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

import { sqlite } from "../db";
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
 * Computes deterministic SHA-256 Event Hash
 */
export function computeEventHash(params: {
  sequenceNumber: number;
  previousEventHash: string;
  agentId: string;
  eventType: string;
  source: string;
  payloadCanonical: string;
  serverTimestamp: number;
}): string {
  const data = `${params.sequenceNumber}:${params.previousEventHash}:${params.agentId}:${params.eventType}:${params.source}:${params.payloadCanonical}:${params.serverTimestamp}`;
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
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

      // 2. Compute SHA256 Event Hash
      const eventHash = computeEventHash({
        sequenceNumber: nextSeq,
        previousEventHash: prevHash,
        agentId: event.agentId,
        eventType: event.eventType,
        source: event.source,
        payloadCanonical: canonicalPayload,
        serverTimestamp,
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
    const list = sqlite
      .prepare(
        `SELECT id, sequence_number, server_timestamp, agent_id, event_type, source, payload, event_hash, previous_event_hash 
         FROM raw_event_ledger 
         ORDER BY sequence_number ASC`
      )
      .all() as Array<{
        id: string;
        sequence_number: number;
        server_timestamp: number;
        agent_id: string;
        event_type: string;
        source: string;
        payload: string;
        event_hash: string;
        previous_event_hash: string;
      }>;

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
        sequenceNumber: ev.sequence_number,
        previousEventHash: ev.previous_event_hash,
        agentId: ev.agentId,
        eventType: ev.event_type,
        source: ev.source,
        payloadCanonical: canonicalPayload,
        serverTimestamp: ev.server_timestamp,
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
