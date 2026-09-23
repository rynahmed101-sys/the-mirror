import { neonSql, sqlite, db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { count, desc } from "drizzle-orm";

export type MirrorLifeState =
  | "SINGULARITY"
  | "WATCHING"
  | "THINKING"
  | "INTEGRATING"
  | "DORMANT"
  | "ERROR";

export type MirrorIngestionSnapshot = {
  observedAt: string;
  totalRecords: number;
  counts: Record<string, number>;
  latest: {
    timeline: string | null;
    ledgerSequence: number | null;
    ledgerHash: string | null;
  };
};

export type MirrorBlackHoleState = {
  agentId: string;
  state: MirrorLifeState;
  pulseCount: number;
  cycleCount: number;
  lastWakeAt: string | null;
  lastThought: string | null;
  lastAction: string | null;
  lastError: string | null;
  activeNodes: string[];
  memory: MirrorIngestionSnapshot | null;
  updatedAt: string;
};

let tableReady = false;

async function ensureTable() {
  if (tableReady) return;

  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");

    await neonSql.query(
      "CREATE TABLE IF NOT EXISTS mirror_black_hole_memory (" +
      "agent_id TEXT PRIMARY KEY, " +
      "snapshot JSONB NOT NULL, " +
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );

    await neonSql.query(
      "CREATE TABLE IF NOT EXISTS mirror_black_hole_state (" +
      "agent_id TEXT PRIMARY KEY, " +
      "state TEXT NOT NULL DEFAULT 'SINGULARITY', " +
      "pulse_count INTEGER NOT NULL DEFAULT 0, " +
      "cycle_count INTEGER NOT NULL DEFAULT 0, " +
      "last_wake_at TIMESTAMPTZ, " +
      "last_thought TEXT, " +
      "last_action TEXT, " +
      "last_error TEXT, " +
      "active_nodes JSONB NOT NULL DEFAULT '[]'::jsonb, " +
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
    );
  } else {
    if (!sqlite) throw new Error("SQLite runtime unavailable.");

    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS mirror_black_hole_memory (" +
      "agent_id TEXT PRIMARY KEY, " +
      "snapshot TEXT NOT NULL, " +
      "updated_at INTEGER NOT NULL)"
    );

    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS mirror_black_hole_state (" +
      "agent_id TEXT PRIMARY KEY, " +
      "state TEXT NOT NULL DEFAULT 'SINGULARITY', " +
      "pulse_count INTEGER NOT NULL DEFAULT 0, " +
      "cycle_count INTEGER NOT NULL DEFAULT 0, " +
      "last_wake_at INTEGER, " +
      "last_thought TEXT, " +
      "last_action TEXT, " +
      "last_error TEXT, " +
      "active_nodes TEXT NOT NULL DEFAULT '[]', " +
      "updated_at INTEGER NOT NULL)"
    );
  }

  tableReady = true;
}

function normalize(row: any, agentId: string): MirrorBlackHoleState {
  const nodes =
    typeof row?.active_nodes === "string"
      ? (() => {
          try {
            return JSON.parse(row.active_nodes);
          } catch {
            return [];
          }
        })()
      : Array.isArray(row?.active_nodes)
        ? row.active_nodes
        : [];

  const memory =
    row?.memory_snapshot
      ? (() => {
          try {
            return typeof row.memory_snapshot === "string"
              ? JSON.parse(row.memory_snapshot)
              : row.memory_snapshot;
          } catch {
            return null;
          }
        })()
      : null;

  return {
    agentId,
    state: (row?.state || "SINGULARITY") as MirrorLifeState,
    pulseCount: Number(row?.pulse_count || 0),
    cycleCount: Number(row?.cycle_count || 0),
    lastWakeAt: row?.last_wake_at ? new Date(row.last_wake_at).toISOString() : null,
    lastThought: row?.last_thought || null,
    lastAction: row?.last_action || null,
    lastError: row?.last_error || null,
    activeNodes: nodes.map(String),
    memory,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString()
  };
}

export async function getBlackHoleState(agentId = "mirror-primary"): Promise<MirrorBlackHoleState> {
  await ensureTable();

  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");

    const rows = await neonSql.query(
      "SELECT s.*, m.snapshot AS memory_snapshot " +
      "FROM mirror_black_hole_state s " +
      "LEFT JOIN mirror_black_hole_memory m ON m.agent_id = s.agent_id " +
      "WHERE s.agent_id = $1 LIMIT 1",
      [agentId]
    );

    if (rows?.[0]) return normalize(rows[0], agentId);

    await neonSql.query(
      "INSERT INTO mirror_black_hole_state(agent_id, updated_at) VALUES($1, NOW()) " +
      "ON CONFLICT(agent_id) DO NOTHING",
      [agentId]
    );

    const fresh = await neonSql.query(
      "SELECT s.*, m.snapshot AS memory_snapshot " +
      "FROM mirror_black_hole_state s " +
      "LEFT JOIN mirror_black_hole_memory m ON m.agent_id = s.agent_id " +
      "WHERE s.agent_id = $1 LIMIT 1",
      [agentId]
    );

    return normalize(fresh?.[0], agentId);
  }

  const row: any = sqlite!.prepare(
    "SELECT s.*, m.snapshot AS memory_snapshot " +
    "FROM mirror_black_hole_state s " +
    "LEFT JOIN mirror_black_hole_memory m ON m.agent_id = s.agent_id " +
    "WHERE s.agent_id = ? LIMIT 1"
  ).get(agentId);

  if (row) return normalize(row, agentId);

  sqlite!.prepare(
    "INSERT INTO mirror_black_hole_state(agent_id, updated_at) VALUES(?, ?)"
  ).run(agentId, Date.now());

  return getBlackHoleState(agentId);
}

export async function pulseBlackHole(agentId = "mirror-primary") {
  await getBlackHoleState(agentId);

  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");

    await neonSql.query(
      "UPDATE mirror_black_hole_state " +
      "SET pulse_count = pulse_count + 1, " +
      "state = CASE WHEN state IN ('THINKING','INTEGRATING') THEN state ELSE 'WATCHING' END, " +
      "updated_at = NOW() " +
      "WHERE agent_id = $1",
      [agentId]
    );
  } else {
    sqlite!.prepare(
      "UPDATE mirror_black_hole_state " +
      "SET pulse_count = pulse_count + 1, " +
      "state = CASE WHEN state IN ('THINKING','INTEGRATING') THEN state ELSE 'WATCHING' END, " +
      "updated_at = ? WHERE agent_id = ?"
    ).run(Date.now(), agentId);
  }

  return getBlackHoleState(agentId);
}

export async function startBlackHoleThinking(agentId = "mirror-primary") {
  await getBlackHoleState(agentId);

  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");

    const rows = await neonSql.query(
      "UPDATE mirror_black_hole_state " +
      "SET state='THINKING', last_wake_at=NOW(), last_error=NULL, updated_at=NOW() " +
      "WHERE agent_id=$1 AND state NOT IN ('THINKING','INTEGRATING') " +
      "RETURNING *",
      [agentId]
    );

    return (rows?.length || 0) > 0;
  }

  const result = sqlite!.prepare(
    "UPDATE mirror_black_hole_state " +
    "SET state='THINKING', last_wake_at=?, last_error=NULL, updated_at=? " +
    "WHERE agent_id=? AND state NOT IN ('THINKING','INTEGRATING')"
  ).run(Date.now(), Date.now(), agentId);

  return Number(result.changes || 0) > 0;
}

export async function finishBlackHoleThinking(
  agentId: string,
  args: {
    cycleDelta?: number;
    thought?: string | null;
    action?: string | null;
    activeNodes?: string[];
    error?: string | null;
  }
) {
  await ensureTable();

  const nextState: MirrorLifeState = args.error ? "ERROR" : "SINGULARITY";
  const nodes = JSON.stringify((args.activeNodes || []).slice(0, 8));
  const cycleDelta = Number(args.cycleDelta || 0);

  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");

    await neonSql.query(
      "UPDATE mirror_black_hole_state SET " +
      "state=$1, cycle_count=cycle_count+$2, last_thought=$3, last_action=$4, " +
      "last_error=$5, active_nodes=$6::jsonb, updated_at=NOW() WHERE agent_id=$7",
      [
        nextState,
        cycleDelta,
        args.thought || null,
        args.action || null,
        args.error || null,
        nodes,
        agentId
      ]
    );
  } else {
    sqlite!.prepare(
      "UPDATE mirror_black_hole_state SET state=?, cycle_count=cycle_count+?, " +
      "last_thought=?, last_action=?, last_error=?, active_nodes=?, updated_at=? " +
      "WHERE agent_id=?"
    ).run(
      nextState,
      cycleDelta,
      args.thought || null,
      args.action || null,
      args.error || null,
      nodes,
      Date.now(),
      agentId
    );
  }

  return getBlackHoleState(agentId);
}

export async function settleBlackHole(agentId = "mirror-primary") {
  await ensureTable();

  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");
    await neonSql.query(
      "UPDATE mirror_black_hole_state SET state='SINGULARITY', updated_at=NOW() WHERE agent_id=$1",
      [agentId]
    );
  } else {
    sqlite!.prepare(
      "UPDATE mirror_black_hole_state SET state='SINGULARITY', updated_at=? WHERE agent_id=?"
    ).run(Date.now(), agentId);
  }

  return getBlackHoleState(agentId);
}

const sourceTables: any = isPg ? pgSchema : sqliteSchema;

export async function ingestMirrorMemory(agentId = "mirror-primary"): Promise<MirrorIngestionSnapshot> {
  await ensureTable();

  const names = [
    "agents","agentApiKeys","agentSessions","rawEventLedger","rawMessages","rawObservations",
    "derivedAnalysis","selfModels","selfModelClaims","behavioralBaselines","anomalies","openQuestions",
    "experiments","predictions","journalEntries","discoveries","behavioralObservations",
    "agentInteractions","toolLogs","timelineEvents","apiAuditLogs"
  ] as const;

  const counts: Record<string, number> = {};

  await Promise.all(
    names.map(async (name) => {
      const table = sourceTables[name];
      if (!table) {
        counts[name] = 0;
        return;
      }

      const [row] = await db.select({ value: count() }).from(table);
      counts[name] = Number(row?.value || 0);
    })
  );

  const [latestTimeline] = sourceTables.timelineEvents
    ? await db.select().from(sourceTables.timelineEvents)
        .orderBy(desc(sourceTables.timelineEvents.createdAt))
        .limit(1)
    : [];

  const [latestLedger] = sourceTables.rawEventLedger
    ? await db.select().from(sourceTables.rawEventLedger)
        .orderBy(desc(sourceTables.rawEventLedger.sequenceNumber))
        .limit(1)
    : [];

  const snapshot: MirrorIngestionSnapshot = {
    observedAt: new Date().toISOString(),
    totalRecords: Object.values(counts).reduce((sum, n) => sum + n, 0),
    counts,
    latest: {
      timeline: latestTimeline?.title ? String(latestTimeline.title) : null,
      ledgerSequence: latestLedger?.sequenceNumber != null ? Number(latestLedger.sequenceNumber) : null,
      ledgerHash: latestLedger?.eventHash ? String(latestLedger.eventHash) : null
    }
  };

  const brainState = await getBlackHoleState(agentId);
  snapshot.counts.brain96_state_nodes = brainState.activeNodes.length;
  snapshot.totalRecords += brainState.activeNodes.length;

  const payload = JSON.stringify(snapshot);

  if (isPg) {
    if (!neonSql) throw new Error("Neon SQL runtime unavailable.");

    await neonSql.query(
      "INSERT INTO mirror_black_hole_memory(agent_id, snapshot, updated_at) " +
      "VALUES($1, $2::jsonb, NOW()) " +
      "ON CONFLICT(agent_id) DO UPDATE SET snapshot=EXCLUDED.snapshot, updated_at=NOW()",
      [agentId, payload]
    );
  } else {
    sqlite!.prepare(
      "INSERT INTO mirror_black_hole_memory(agent_id, snapshot, updated_at) VALUES(?,?,?) " +
      "ON CONFLICT(agent_id) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at"
    ).run(agentId, payload, Date.now());
  }

  return snapshot;
}
