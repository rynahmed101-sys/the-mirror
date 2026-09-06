import { NextResponse } from "next/server";
import { db, sqlite } from "@/lib/db";
import { rawEventLedger, apiAuditLogs } from "@/lib/db/schema";
import { verifyLedgerIntegrity } from "@/lib/agent/eventLedger";
import { sql, eq, and, gte, lte, gt, lt } from "drizzle-orm";

export async function GET(req: Request) {
  const startTime = Date.now();
  let statusCode = 200;

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 500);
    const verify = searchParams.get("verify") === "true";
    const agentId = searchParams.get("agentId");
    const cursor = searchParams.get("cursor") ? parseInt(searchParams.get("cursor")!) : null;
    const from = searchParams.get("from") ? parseInt(searchParams.get("from")!) : null;
    const to = searchParams.get("to") ? parseInt(searchParams.get("to")!) : null;
    const order = searchParams.get("order") === "desc" ? "desc" : "asc";

    if (verify) {
      const integrityStatus = await verifyLedgerIntegrity();

      // Record API audit log
      try {
        await db.insert(apiAuditLogs).values({
          endpoint: "/api/v1/events/ledger?verify=true",
          method: "GET",
          statusCode: 200,
          payloadSummary: JSON.stringify({ status: integrityStatus.status, valid: integrityStatus.valid }),
        });
      } catch {}

      return NextResponse.json(integrityStatus);
    }

    // Build conditions preserving canonical sequence order
    const conditions: any[] = [];
    if (agentId) conditions.push(eq(rawEventLedger.agentId, agentId));
    if (from !== null) conditions.push(gte(rawEventLedger.sequenceNumber, from));
    if (to !== null) conditions.push(lte(rawEventLedger.sequenceNumber, to));
    if (cursor !== null) {
      if (order === "asc") {
        conditions.push(gt(rawEventLedger.sequenceNumber, cursor));
      } else {
        conditions.push(lt(rawEventLedger.sequenceNumber, cursor));
      }
    }

    let query = db.select().from(rawEventLedger);
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const orderExpr =
      order === "asc"
        ? sql`${rawEventLedger.sequenceNumber} ASC`
        : sql`${rawEventLedger.sequenceNumber} DESC`;

    const events = await query.orderBy(orderExpr).limit(limit);

    const nextCursor =
      events.length > 0 ? events[events.length - 1].sequenceNumber : null;

    // Record API audit log
    try {
      await db.insert(apiAuditLogs).values({
        endpoint: "/api/v1/events/ledger",
        method: "GET",
        statusCode: 200,
        payloadSummary: JSON.stringify({ count: events.length, nextCursor }),
      });
    } catch {}

    return NextResponse.json({
      events: events.map((e) => ({
        ...e,
        payload: e.payload ? JSON.parse(e.payload) : null,
      })),
      pagination: {
        limit,
        count: events.length,
        nextCursor,
        order,
      },
    });
  } catch (error: any) {
    statusCode = 500;
    try {
      await db.insert(apiAuditLogs).values({
        endpoint: "/api/v1/events/ledger",
        method: "GET",
        statusCode: 500,
        payloadSummary: JSON.stringify({ error: error.message }),
      });
    } catch {}

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
