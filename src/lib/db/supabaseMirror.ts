import crypto from "crypto";
/**
 * THE MIRROR — Supabase secondary evidence mirror.
 *
 * Neon remains the operational database. Supabase stores an independent,
 * append-oriented copy of integrity-critical evidence so the laboratory can
 * detect storage divergence without changing the primary execution path.
 */

type MirrorEvent = {
  sourceEventId: string;
  sequenceNumber: number;
  serverTimestamp: number;
  agentId: string;
  sessionId: string | null;
  experimentId: string | null;
  requestId: string | null;
  eventType: string;
  source: string;
  payload: unknown;
  canonicalEvent: string;
  eventHash: string;
  previousEventHash: string;
};

type MirrorObservation = {
  sourceObservationId: string;
  agentId: string;
  sessionId: string | null;
  experimentId: string | null;
  eventType: string;
  input?: string | null;
  output?: string | null;
  toolCall?: unknown;
  toolResult?: unknown;
  actualResult?: unknown;
};

type MirrorRun = {
  suiteId: string;
  agentId: string;
  suiteVersion: string;
  seed: string;
  trialCount: number;
  predictionAccuracy: number;
  meanBrier: number;
  toolCalls: number;
  results: unknown[];
};

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseMirrorConfigured = Boolean(supabaseUrl && serviceKey);

function headers() {
  return {
    apikey: serviceKey!,
    Authorization: "Bearer " + serviceKey!,
    "Content-Type": "application/json",
  };
}

async function post(path: string, body: unknown): Promise<boolean> {
  if (!isSupabaseMirrorConfigured) return false;
  const response = await fetch(supabaseUrl! + "/rest/v1/" + path, {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase ${path} returned ${response.status}: ${detail.slice(0, 500)}`);
  }
  return true;
}

async function patchState(patch: Record<string, unknown>) {
  if (!isSupabaseMirrorConfigured) return;
  const response = await fetch(
    supabaseUrl! + "/rest/v1/mirror_replication_state?id=eq.1",
    {
      method: "PATCH",
      headers: { ...headers(), Prefer: "return=minimal" },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    console.error("[MIRROR][SUPABASE] state update failed:", response.status);
  }
}

async function recordFailure(error: unknown) {
  console.error("[MIRROR][SUPABASE] secondary write failed:", error);
  await patchState({
    enabled: true,
    last_failure_at: new Date().toISOString(),
    last_error: error instanceof Error ? error.message : String(error),
  });
}

export async function mirrorRawEvent(event: MirrorEvent) {
  if (!isSupabaseMirrorConfigured) return { configured: false, mirrored: false };

  const started = Date.now();
  try {
    await post("mirror_shadow_events", {
      source_event_id: event.sourceEventId,
      source_sequence: event.sequenceNumber,
      server_timestamp: event.serverTimestamp,
      agent_id: event.agentId,
      session_id: event.sessionId,
      experiment_id: event.experimentId,
      request_id: event.requestId,
      event_type: event.eventType,
      source: event.source,
      payload: event.payload,
      canonical_event: event.canonicalEvent,
      event_hash: event.eventHash,
      previous_event_hash: event.previousEventHash,
    });

    await patchState({
      enabled: true,
      last_source_sequence: event.sequenceNumber,
      last_event_hash: event.eventHash,
      mirrored_event_count: event.sequenceNumber,
      last_success_at: new Date().toISOString(),
      last_error: null,
    });

    return { configured: true, mirrored: true, durationMs: Date.now() - started };
  } catch (error) {
    await recordFailure(error);
    return { configured: true, mirrored: false, durationMs: Date.now() - started };
  }
}

export async function mirrorRawObservation(observation: MirrorObservation) {
  if (!isSupabaseMirrorConfigured) return { configured: false, mirrored: false };
  try {
    await post("mirror_shadow_observations", {
      source_observation_id: observation.sourceObservationId,
      agent_id: observation.agentId,
      session_id: observation.sessionId,
      experiment_id: observation.experimentId,
      event_type: observation.eventType,
      input: observation.input ?? null,
      output: observation.output ?? null,
      tool_call: observation.toolCall ?? null,
      tool_result: observation.toolResult ?? null,
      actual_result: observation.actualResult ?? null,
    });
    await patchState({ enabled: true, last_success_at: new Date().toISOString(), last_error: null });
    return { configured: true, mirrored: true };
  } catch (error) {
    await recordFailure(error);
    return { configured: true, mirrored: false };
  }
}

export async function mirrorExperimentRun(run: MirrorRun) {
  if (!isSupabaseMirrorConfigured) return { configured: false, mirrored: false };
  try {
    await post("mirror_experiment_runs", {
      suite_id: run.suiteId,
      agent_id: run.agentId,
      suite_version: run.suiteVersion,
      seed: run.seed,
      trial_count: run.trialCount,
      prediction_accuracy: run.predictionAccuracy,
      mean_brier: run.meanBrier,
      tool_calls: run.toolCalls,
      results: run.results,
    });
    await patchState({ enabled: true, last_success_at: new Date().toISOString(), last_error: null });
    return { configured: true, mirrored: true };
  } catch (error) {
    await recordFailure(error);
    return { configured: true, mirrored: false };
  }
}

type MirrorProjection = {
  projectionId: string;
  suiteId: string;
  trialKey: string;
  chamber: string;
  agentId: string;
  sessionId: string | null;
  experimentId: string | null;
  projection: unknown;
  actualTrace: unknown;
  comparison: unknown;
  visualSvg?: string | null;
};

export async function mirrorSimulationProjection(projection: MirrorProjection) {
  if (!isSupabaseMirrorConfigured) return { configured: false, mirrored: false };
  try {
    await post("mirror_simulation_projections", {
      projection_id: projection.projectionId,
      suite_id: projection.suiteId,
      trial_key: projection.trialKey,
      chamber: projection.chamber,
      agent_id: projection.agentId,
      session_id: projection.sessionId,
      experiment_id: projection.experimentId,
      projection: projection.projection,
      actual_trace: projection.actualTrace,
      comparison: projection.comparison,
      visual_svg: projection.visualSvg ?? null,
    });
    await patchState({ enabled: true, last_success_at: new Date().toISOString(), last_error: null });
    return { configured: true, mirrored: true };
  } catch (error) {
    await recordFailure(error);
    return { configured: true, mirrored: false };
  }
}

export async function mirrorExperimentArtifact(run: MirrorRun) {
  if (!isSupabaseMirrorConfigured) return { configured: false, stored: false };
  const payload = JSON.stringify({
    suiteId: run.suiteId,
    agentId: run.agentId,
    suiteVersion: run.suiteVersion,
    seed: run.seed,
    trialCount: run.trialCount,
    predictionAccuracy: run.predictionAccuracy,
    meanBrier: run.meanBrier,
    toolCalls: run.toolCalls,
    results: run.results,
  });
  const bytes = Buffer.byteLength(payload, "utf8");
  const sha256 = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  const storagePath = `${run.agentId}/${run.suiteId}.json`;
  try {
    const response = await fetch(
      supabaseUrl! + "/storage/v1/object/mirror-experiment-artifacts/" + storagePath.split("/").map(encodeURIComponent).join("/"),
      {
        method: "POST",
        headers: {
          ...headers(),
          "x-upsert": "true",
          "Content-Type": "application/json",
        },
        body: payload,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Supabase Storage returned ${response.status}: ${detail.slice(0, 500)}`);
    }
    await post("mirror_experiment_artifacts", {
      suite_id: run.suiteId,
      storage_path: storagePath,
      content_type: "application/json",
      byte_size: bytes,
      sha256,
    });
    return { configured: true, stored: true, storagePath, byteSize: bytes, sha256 };
  } catch (error) {
    await recordFailure(error);
    return { configured: true, stored: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function getJson(path: string) {
  if (!isSupabaseMirrorConfigured) return null;
  const response = await fetch(supabaseUrl! + "/rest/v1/" + path, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Supabase ${path} returned ${response.status}`);
  }
  return response.json();
}

export async function getSupabaseMirrorStatus() {
  if (!isSupabaseMirrorConfigured) {
    return {
      configured: false,
      enabled: false,
      sourceDatabase: "neon",
      reason: "SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY are not configured on the server.",
    };
  }

  try {
    const [stateRows, healthRows, projectionRows] = await Promise.all([
      getJson("mirror_replication_state?id=eq.1&select=*"),
      getJson("mirror_ledger_health?select=*"),
      getJson("mirror_simulation_projections?select=id&limit=1"),
    ]);
    return {
      configured: true,
      enabled: Boolean(stateRows?.[0]?.enabled),
      state: stateRows?.[0] ?? null,
      ledgerHealth: healthRows?.[0] ?? null,
      hasSimulationProjections: Array.isArray(projectionRows),
    };
  } catch (error) {
    return {
      configured: true,
      enabled: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runSupabaseConnectivityTest() {
  if (!isSupabaseMirrorConfigured) {
    return { configured: false, passed: false, error: "Secondary database credentials are not configured." };
  }
  const started = Date.now();
  try {
    await post("mirror_replication_checks", {
      check_name: "SERVER_TO_SUPABASE_WRITE",
      passed: true,
      details: { transport: "postgrest", timestamp: new Date().toISOString() },
      duration_ms: Date.now() - started,
    });
    const rows = await getJson(
      "mirror_replication_checks?check_name=eq.SERVER_TO_SUPABASE_WRITE&select=id,passed,checked_at&order=id.desc&limit=1"
    );
    const observed = rows?.[0];
    const passed = Boolean(observed?.passed);
    await patchState({
      enabled: true,
      last_success_at: new Date().toISOString(),
      last_error: passed ? null : "Connectivity row could not be read back.",
    });
    return { configured: true, passed, durationMs: Date.now() - started, observed };
  } catch (error) {
    await recordFailure(error);
    return { configured: true, passed: false, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}
