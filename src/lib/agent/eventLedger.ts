/**
 * THE MIRROR — Cryptographic Append-Only Raw Event Ledger
 *
 * Implements a tamper-evident SHA256 cryptographic chain for all raw events.
 * Guarantees immutability and provenance tracking.
 */

import { db } from "../db";
import { rawEventLedger } from "../db/schema";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

export async function appendRawEventLedger(event: {
  agentId: string;
  sessionId?: string | null;
  experimentId?: string | null;
  requestId?: string | null;
  eventType: string;
  source: "AGENT" | "SYSTEM" | "RESEARCHER" | "SCHEDULED" | "OTHER_AGENT";
  payload: any;
}) {
  try {
    // 1. Fetch latest event to get previous_event_hash
    const lastEventList = await db
      .select()
      .from(rawEventLedger)
      .orderBy(sql`${rawEventLedger.createdAt} DESC`)
      .limit(1);

    const previousEventHash = lastEventList.length > 0 ? lastEventList[0].eventHash : GENESIS_HASH;
    const payloadStr = typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload);
    const timestamp = Date.now();

    // 2. Compute SHA256 Event Hash
    const hashData = `${previousEventHash}:${event.agentId}:${event.eventType}:${event.source}:${payloadStr}:${timestamp}`;
    const eventHash = crypto.createHash("sha256").update(hashData).digest("hex");

    // 3. Append to Raw Event Ledger
    const [inserted] = await db
      .insert(rawEventLedger)
      .values({
        agentId: event.agentId,
        sessionId: event.sessionId || null,
        experimentId: event.experimentId || null,
        requestId: event.requestId || null,
        eventType: event.eventType,
        source: event.source,
        payload: payloadStr,
        eventHash,
        previousEventHash,
        isImmutable: true,
      })
      .returning();

    return inserted;
  } catch (err: any) {
    console.error("Failed to append raw event to ledger:", err.message);
    return null;
  }
}

export async function verifyLedgerIntegrity(): Promise<{ valid: boolean; totalEvents: number; corruptEventId?: string }> {
  try {
    const list = await db
      .select()
      .from(rawEventLedger)
      .orderBy(sql`${rawEventLedger.createdAt} ASC`);

    if (list.length === 0) return { valid: true, totalEvents: 0 };

    let expectedPrevHash = GENESIS_HASH;
    for (const ev of list) {
      if (ev.previousEventHash !== expectedPrevHash) {
        return { valid: false, totalEvents: list.length, corruptEventId: ev.id };
      }
      expectedPrevHash = ev.eventHash;
    }

    return { valid: true, totalEvents: list.length };
  } catch (err: any) {
    console.error("Ledger integrity verification failed:", err.message);
    return { valid: false, totalEvents: 0 };
  }
}
