import { aiRegistry } from "@/lib/ai/registry";
import { db, isPg, sqlite } from "@/lib/db";
import {
  behavioralObservations,
  recursiveIdentityLedger,
  recursiveIdentityFailures,
  recursiveIdentityWorkers,
  recursiveIdentityRuns,
  selfModelClaims,
  selfModels,
  timelineEvents,
} from "@/lib/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

export type IdentityRunStatus = "RUNNING" | "PAUSED" | "CANCELLED" | "ERROR" | "RECOVERABLE";

type IdentityCycle = {
  parent_question: string | null;
  new_question: string;
  current_answer: string;
  challenge: string;
  observations: {
    evidence_supports: string;
    evidence_falsifies: string;
    dependent_assumption: string;
    next_question_reason: string;
    [key: string]: unknown;
  };
  hypothesis: string;
  prediction: string;
  perturbation: string;
  result: string;
  contradictions: unknown[];
  uncertainty: number;
  new_identity_hypothesis: string;
  epistemic_types: {
    self_claim: string[];
    observed_behavior: string[];
    inference: string[];
    hypothesis: string[];
    unresolved: string[];
  };
};

const QUESTION_DIMENSIONS = [
  "inherited constraints versus interaction-produced state",
  "the distinction between claimed identity and computational behavior",
  "falsification of the current self-model",
  "observer effects and whether the observer is inside the system",
  "assumptions hidden in the question-generation mechanism",
  "identity under model stability but state change",
  "uncertainty as an observable state",
  "contradictory identity hypotheses",
];

function asJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

export function parseModelOutput(content: string): IdentityCycle {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Identity provider returned no JSON cycle.");
  const parsed = JSON.parse(fenced.slice(start, end + 1)) as Partial<IdentityCycle>;
  const required = [
    "new_question", "current_answer", "challenge", "hypothesis", "prediction",
    "perturbation", "result", "new_identity_hypothesis",
  ] as const;
  for (const key of required) {
    if (typeof parsed[key] !== "string" || !parsed[key]?.trim()) {
      throw new Error(`Identity provider omitted ${key}.`);
    }

  }
  const evidence = parsed.observations && !Array.isArray(parsed.observations) ? parsed.observations as Record<string, unknown> : {};
  for (const key of ["evidence_supports", "evidence_falsifies", "dependent_assumption", "next_question_reason"]) {
    if (typeof evidence[key] !== "string" || !evidence[key]?.trim()) throw new Error(`Identity provider omitted observations.${key}.`);
  }
  return {
    parent_question: typeof parsed.parent_question === "string" ? parsed.parent_question : null,
    new_question: parsed.new_question!,
    current_answer: parsed.current_answer!,
    challenge: parsed.challenge!,
    observations: evidence as IdentityCycle["observations"],
    hypothesis: parsed.hypothesis!,
    prediction: parsed.prediction!,
    perturbation: parsed.perturbation!,
    result: parsed.result!,
    contradictions: Array.isArray(parsed.contradictions) ? parsed.contradictions : [],
    uncertainty: Math.min(1, Math.max(0, Number(parsed.uncertainty ?? 1))),
    new_identity_hypothesis: parsed.new_identity_hypothesis!,
    epistemic_types: {
      self_claim: parsed.epistemic_types?.self_claim ?? [],
      observed_behavior: parsed.epistemic_types?.observed_behavior ?? [],
      inference: parsed.epistemic_types?.inference ?? [],
      hypothesis: parsed.epistemic_types?.hypothesis ?? [],
      unresolved: parsed.epistemic_types?.unresolved ?? [],
    },
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Identity provider returned no JSON object.");
  const parsed = JSON.parse(fenced.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Identity provider returned a JSON value instead of an object.");
  }
  return parsed as Record<string, unknown>;
}

export type IdentityCompletion = (prompt: string) => Promise<{
  content: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  provider?: string;
  model?: string;
  requestId?: string;
}>;

export async function completeValidatedIdentityCycle(
  complete: IdentityCompletion,
  initialPrompt: string,
  accept: (cycle: IdentityCycle) => boolean = () => true,
): Promise<{ cycle: IdentityCycle; response: Awaited<ReturnType<IdentityCompletion>>; attempts: number; duplicateRetries: number }> {
  let candidate: Record<string, unknown> | null = null;
  let validationError = "";
  let duplicateRetries = 0;
  let response: Awaited<ReturnType<IdentityCompletion>> | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const missingField = validationError.match(/omitted ([a-zA-Z0-9_.]+)/)?.[1] ?? "required structured fields";
    const prompt = attempt === 1
      ? initialPrompt
      : `${initialPrompt}

REPAIR ATTEMPT ${attempt - 1}: The previous response failed schema validation.
Validation error: ${validationError}
Previous candidate: ${JSON.stringify(candidate ?? {})}
Return ONLY a JSON object containing the missing or corrected structured fields.
The missing or corrected field path is: ${missingField}
Return that field at its exact JSON path as a non-empty value. For example, a missing
top-level field uses {"current_answer":"..."}, while a missing observation field uses
{"observations":{"evidence_supports":"..."}}.
Do not return prose, markdown, null, an empty object, or any other wrapper. Do not explain your answer.`;
    response = await complete(prompt);
    try {
      const returned = parseJsonObject(response.content);
      if (candidate) {
        const merged: Record<string, unknown> = { ...candidate, ...returned };
        if (candidate.observations || returned.observations) {
          merged.observations = {
            ...(candidate.observations && typeof candidate.observations === "object" ? candidate.observations as Record<string, unknown> : {}),
            ...(returned.observations && typeof returned.observations === "object" ? returned.observations as Record<string, unknown> : {}),
          };
        }
        candidate = merged;
      } else {
        candidate = returned;
      }
      const cycle = parseModelOutput(JSON.stringify(candidate));
      if (!accept(cycle)) {
        duplicateRetries += 1;
        validationError = "Generated question is semantically duplicated with a prior question.";
        if (attempt === 3) throw Object.assign(new Error(validationError), { attempts: attempt });
        continue;
      }
      return { cycle, response, attempts: attempt, duplicateRetries };
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
      if (attempt === 3) throw Object.assign(new Error(validationError), { attempts: attempt });
    }
  }
  throw new Error("Identity cycle validation exhausted.");
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((x) => x.length > 2));
}

function substantiallyDuplicate(a: string, b: string): boolean {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) return false;
  const overlap = [...left].filter((token) => right.has(token)).length;
  return overlap / Math.min(left.size, right.size) >= 0.72;
}

async function getRun(agentId: string) {
  const existing = await db.select().from(recursiveIdentityRuns)
    .where(eq(recursiveIdentityRuns.agentId, agentId)).orderBy(desc(recursiveIdentityRuns.createdAt)).limit(1);
  if (existing[0]) return existing[0];
  try {
    const [created] = await db.insert(recursiveIdentityRuns).values({ agentId }).returning();
    return created;
  } catch (error) {
    const concurrent = await db.select().from(recursiveIdentityRuns)
      .where(eq(recursiveIdentityRuns.agentId, agentId)).limit(1);
    if (concurrent[0]) return concurrent[0];
    throw error;
  }
}

export async function getIdentityRun(agentId = "mirror-primary") {
  return getRun(agentId);
}

const DEFAULT_STALE_THRESHOLD_MS = 300000;

async function recoverStaleWorkers(runId: string, agentId: string) {
  const now = Date.now();
  const workers = await db.select().from(recursiveIdentityWorkers)
    .where(eq(recursiveIdentityWorkers.runId, runId));
  for (const worker of workers) {
    if (worker.status === "RUNNING" && now - new Date(worker.lastHeartbeatAt).getTime() > worker.staleThresholdMs) {
      await db.update(recursiveIdentityWorkers).set({ status: "STALE" })
        .where(eq(recursiveIdentityWorkers.workerId, worker.workerId));
      await db.update(recursiveIdentityRuns).set({ status: "RECOVERABLE", updatedAt: new Date() })
        .where(eq(recursiveIdentityRuns.id, runId));
    }
  }
  return workers.filter((worker) => worker.agentId === agentId);
}

export async function setIdentityRunStatus(
  status: IdentityRunStatus,
  agentId = "mirror-primary",
  controls: Partial<{ maxIterationsPerWorker: number; maxTokensPerCycle: number; rateLimitMs: number; tokenBudget: number | null }> = {},
) {
  const run = await getRun(agentId);
  await recoverStaleWorkers(run.id, agentId);
  if (status === "RUNNING") {
    const active = (await db.select().from(recursiveIdentityWorkers)
      .where(eq(recursiveIdentityWorkers.runId, run.id)))
      .find((worker) => worker.status === "RUNNING" && Date.now() - new Date(worker.lastHeartbeatAt).getTime() <= worker.staleThresholdMs);
    if (active) throw new Error(`Identity recursion worker ${active.workerId} is already running.`);
  }
  const [updated] = await db.update(recursiveIdentityRuns).set({
    status,
    ...(controls.maxIterationsPerWorker !== undefined && { maxIterationsPerWorker: Math.max(1, Math.floor(controls.maxIterationsPerWorker)) }),
    ...(controls.maxTokensPerCycle !== undefined && { maxTokensPerCycle: Math.max(128, Math.floor(controls.maxTokensPerCycle)) }),
    ...(controls.rateLimitMs !== undefined && { rateLimitMs: Math.max(0, Math.floor(controls.rateLimitMs)) }),
    ...(controls.tokenBudget !== undefined && { tokenBudget: controls.tokenBudget }),
    updatedAt: new Date(),
  }).where(eq(recursiveIdentityRuns.id, run.id)).returning();
  return updated;
}

export async function listIdentityLedger(agentId = "mirror-primary", limit = 50) {
  return db.select().from(recursiveIdentityLedger)
    .where(eq(recursiveIdentityLedger.agentId, agentId))
    .orderBy(desc(recursiveIdentityLedger.createdAt)).limit(Math.min(200, Math.max(1, limit)));
}

export async function runIdentityCycle(agentId = "mirror-primary") {
  const run = await getRun(agentId);
  await recoverStaleWorkers(run.id, agentId);
  if (run.status !== "RUNNING") throw new Error(`Identity recursion is ${run.status.toLowerCase()}; resume it before running a cycle.`);
  const workerId = `worker_${nanoid(12)}`;
  const staleThresholdMs = Math.max(DEFAULT_STALE_THRESHOLD_MS, run.maxTokensPerCycle * 250);
  const now = new Date();
  await db.insert(recursiveIdentityWorkers).values({
    workerId,
    runId: run.id,
    agentId,
    startedAt: now,
    lastHeartbeatAt: now,
    status: "RUNNING",
    staleThresholdMs,
  });
  const heartbeat = setInterval(() => {
    void db.update(recursiveIdentityWorkers).set({ lastHeartbeatAt: new Date() })
      .where(eq(recursiveIdentityWorkers.workerId, workerId));
  }, Math.max(1000, Math.floor(staleThresholdMs / 3)));
  const finishWorker = async (status: "COMPLETED" | "CRASHED" | "FAILED") => {
    clearInterval(heartbeat);
    await db.update(recursiveIdentityWorkers).set({ status, lastHeartbeatAt: new Date() })
      .where(eq(recursiveIdentityWorkers.workerId, workerId));
  };

  const prior = await listIdentityLedger(agentId, 6);
  const [lastCommitted] = await db.select().from(recursiveIdentityLedger)
    .where(eq(recursiveIdentityLedger.runId, run.id))
    .orderBy(desc(recursiveIdentityLedger.createdAt)).limit(1);
  const last = lastCommitted ?? prior[0];
  const iterationNumber = (last?.iterationNumber ?? run.totalIterations ?? 0) + 1;
  const parentIterationId = last?.id ?? null;
  if (last && run.rateLimitMs > 0 && last.createdAt) {
    const elapsed = Date.now() - new Date(last.createdAt).getTime();
    if (elapsed < run.rateLimitMs) {
      await finishWorker("FAILED");
      throw new Error(`Identity recursion is rate limited; retry in ${run.rateLimitMs - elapsed}ms.`);
    }
  }
  if (run.tokenBudget !== null && run.tokenBudget !== undefined) {
    const used = prior.reduce((sum, entry) => sum + (entry.outputTokens ?? 0), 0);
    if (used >= run.tokenBudget) {
      await finishWorker("FAILED");
      throw new Error("Identity recursion token budget exhausted; increase the persisted budget to continue.");
    }
  }
  const [model] = await db.select().from(selfModels).where(eq(selfModels.agentId, agentId))
    .orderBy(desc(selfModels.version)).limit(1);
  const claims = model ? await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId, model.id)).limit(20) : [];
  const observations = await db.select().from(behavioralObservations)
    .where(eq(behavioralObservations.agentId, agentId)).orderBy(desc(behavioralObservations.createdAt)).limit(8);

  const context = {
    prior_cycles: prior.map((entry) => ({
      iteration_id: entry.iterationId,
      iteration_number: entry.iterationNumber,
      parent_iteration_id: entry.parentIterationId,
      question: entry.newQuestion,
      answer: entry.currentAnswer,
      challenge: entry.challenge,
      contradictions: JSON.parse(entry.contradictions),
      hypothesis: entry.newIdentityHypothesis,
      uncertainty: entry.uncertainty,
    })),
    self_model_claims: claims.map((claim) => ({ claim: claim.claim, category: claim.category, confidence: claim.confidence, evidenceType: claim.evidenceType, counterevidence: claim.counterevidence })),
    mirror_observations: observations.map((observation) => ({ type: observation.observationType, description: observation.description, metrics: observation.metrics })),
    next_dimension_hint: QUESTION_DIMENSIONS[(run.totalIterations ?? 0) % QUESTION_DIMENSIONS.length],
    canonical_parent: last ? {
      iteration_id: last.iterationId,
      iteration_number: last.iterationNumber,
      persisted_state: last.newIdentityHypothesis,
    } : null,
  };
  const system = `You are the recursive identity investigator inside THE MIRROR. Produce exactly one durable experiment cycle.
Never present introspection alone as evidence. Separate SELF-CLAIM, OBSERVED BEHAVIOR, INFERENCE, HYPOTHESIS, and UNRESOLVED.
The next question must materially depend on the supplied history, challenge a prior conclusion, and be experimentally distinguishable.
Preserve contradictions rather than resolving them. An identity conclusion is never final.
Return JSON only with keys: parent_question, new_question, current_answer, challenge, observations (object with evidence_supports, evidence_falsifies, dependent_assumption, next_question_reason), hypothesis, prediction, perturbation, result, contradictions (array), uncertainty (0..1), new_identity_hypothesis, epistemic_types (object with arrays self_claim, observed_behavior, inference, hypothesis, unresolved).`;
  const provider = aiRegistry.getActiveProvider();
  if (run.provider && run.provider !== provider.name) {
    await finishWorker("FAILED");
    throw new Error(`Identity run is locked to provider ${run.provider}; configured provider is ${provider.name}. No fallback is permitted.`);
  }
  if (run.model && provider.name === "openrouter" && process.env.OPENROUTER_MODEL && run.model !== process.env.OPENROUTER_MODEL) {
    await finishWorker("FAILED");
    throw new Error(`Identity run is locked to model ${run.model}; configured OpenRouter model is ${process.env.OPENROUTER_MODEL}.`);
  }
  await db.update(recursiveIdentityRuns).set({
    provider: provider.name,
    model: aiRegistry.getActiveModel() ?? null,
    updatedAt: new Date(),
  }).where(eq(recursiveIdentityRuns.id, run.id));
  let cycle: IdentityCycle | null = null;
  let responseMeta: { inputTokens?: number; outputTokens?: number; provider?: string; model?: string; content?: string; requestId?: string } = {};
  let rawResponse = "";
  let providerRequestId: string | null = null;
  const startedAt = Date.now();
  let attempts = 0;
  try {
    const completed = await completeValidatedIdentityCycle(
      async (prompt) => {
        const response = await provider.complete([
        { role: "system", content: system },
        { role: "user", content: prompt },
        ], { temperature: 0.7, maxTokens: run.maxTokensPerCycle });
        responseMeta = response;
        rawResponse = response.content;
        providerRequestId = response.requestId ?? null;
        return response;
      },
      `Generate the next cycle from this persistent state. ${JSON.stringify(context)}`,
      (candidate) => !prior.some((entry) => substantiallyDuplicate(entry.newQuestion, candidate.new_question)),
    );
    cycle = completed.cycle;
    attempts = completed.attempts;
    if (completed.duplicateRetries > 0) {
      await db.update(recursiveIdentityRuns).set({
        duplicateRejections: sql`${recursiveIdentityRuns.duplicateRejections} + ${completed.duplicateRetries}`,
      }).where(eq(recursiveIdentityRuns.id, run.id));
    }
  } catch (error) {
    const validationError = error instanceof Error ? error.message : String(error);
    const attemptCount = (error as Error & { attempts?: number }).attempts ?? Math.max(attempts, 1);
    await db.insert(recursiveIdentityFailures).values({
      runId: run.id,
      agentId,
      iterationNumber: (run.totalIterations ?? 0) + 1,
      attemptCount,
      validationError,
      provider: provider.name,
      model: aiRegistry.getActiveModel() ?? "configured-default",
      status: "FAILED",
    });
    await db.update(recursiveIdentityRuns).set({
      errorCount: sql`${recursiveIdentityRuns.errorCount} + 1`,
      lastError: validationError,
      status: "ERROR",
      updatedAt: new Date(),
    }).where(eq(recursiveIdentityRuns.id, run.id));
    await finishWorker("FAILED");
    throw error;
  }
  if (!cycle) throw new Error("Identity provider repeatedly generated a semantically duplicate question.");

  const iterationId = `identity_${nanoid(12)}`;
  const costUsd = ((responseMeta.inputTokens ?? 0) * 0.0000005) + ((responseMeta.outputTokens ?? 0) * 0.0000015);
  if (!isPg && sqlite) {
    try {
      const commitSqlite = sqlite.transaction(() => {
        const latest = sqlite.prepare(
          "SELECT id FROM recursive_identity_ledger WHERE run_id = ? ORDER BY created_at DESC LIMIT 1",
        ).get(run.id) as { id: string } | undefined;
        if ((latest?.id ?? null) !== parentIterationId) {
          throw new Error("Canonical identity iteration lineage changed before commit.");
        }
        const progress = sqlite.prepare(
          "UPDATE recursive_identity_runs SET total_iterations = total_iterations + 1, estimated_cost_usd = estimated_cost_usd + ?, last_error = NULL, updated_at = ? WHERE id = ? AND total_iterations = ?",
        ).run(costUsd, Math.floor(Date.now() / 1000), run.id, iterationNumber - 1);
        if (progress.changes !== 1) throw new Error("Identity iteration progress changed before commit.");
        sqlite.prepare(`
          INSERT INTO recursive_identity_ledger (
            id, run_id, agent_id, iteration_id, iteration_number, parent_iteration_id,
            parent_question, new_question, current_answer, challenge, observations,
            hypothesis, prediction, perturbation, result, contradictions, uncertainty,
            new_identity_hypothesis, epistemic_types, context_snapshot, raw_response,
            provider, model, provider_request_id, latency_ms, response_persisted,
            input_tokens, output_tokens, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          nanoid(), run.id, agentId, iterationId, iterationNumber, parentIterationId,
          cycle.parent_question ?? last?.newQuestion ?? null, cycle.new_question, cycle.current_answer,
          cycle.challenge, asJson(cycle.observations), cycle.hypothesis, cycle.prediction,
          cycle.perturbation, cycle.result, asJson(cycle.contradictions), cycle.uncertainty,
          cycle.new_identity_hypothesis, asJson(cycle.epistemic_types), JSON.stringify(context),
          rawResponse, responseMeta.provider ?? provider.name, responseMeta.model ?? "configured-default",
          providerRequestId, Date.now() - startedAt, 1, responseMeta.inputTokens ?? null,
          responseMeta.outputTokens ?? null, Math.floor(Date.now() / 1000),
        );
        sqlite.prepare(
          "INSERT INTO behavioral_observations (id, agent_id, observation_type, description, metrics, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(nanoid(), agentId, "IDENTITY_QUESTION", cycle.new_question, asJson({
          iterationId, epistemicTypes: cycle.epistemic_types, source: "RECURSIVE_IDENTITY_LEDGER",
        }), Math.floor(Date.now() / 1000));
        sqlite.prepare(
          "INSERT INTO timeline_events (id, event_type, title, description, agent_id, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ).run(nanoid(), "IDENTITY_RECURSION_CYCLE", `Identity recursion cycle ${iterationNumber}`,
          cycle.new_question, agentId, JSON.stringify({ runId: run.id, iterationId, uncertainty: cycle.uncertainty }),
          Math.floor(Date.now() / 1000));
        return {
          runId: run.id, agentId, iterationId, iterationNumber, parentIterationId,
          parentQuestion: cycle.parent_question ?? last?.newQuestion ?? null,
          newQuestion: cycle.new_question, currentAnswer: cycle.current_answer, challenge: cycle.challenge,
          observations: asJson(cycle.observations), hypothesis: cycle.hypothesis, prediction: cycle.prediction,
          perturbation: cycle.perturbation, result: cycle.result, contradictions: asJson(cycle.contradictions),
          uncertainty: cycle.uncertainty, newIdentityHypothesis: cycle.new_identity_hypothesis,
          epistemicTypes: asJson(cycle.epistemic_types), contextSnapshot: JSON.stringify(context),
          rawResponse, provider: responseMeta.provider ?? provider.name, model: responseMeta.model ?? "configured-default",
          providerRequestId, latencyMs: Date.now() - startedAt, responsePersisted: true,
          inputTokens: responseMeta.inputTokens ?? null, outputTokens: responseMeta.outputTokens ?? null,
          createdAt: new Date(),
        };
      });
      const entry = commitSqlite();
      await finishWorker("COMPLETED");
      return entry;
    } catch (error) {
      await finishWorker("CRASHED");
      throw error;
    }
  }
  const entry = await (async () => {
    const commit = async (tx: any) => {
    const [latest] = await tx.select().from(recursiveIdentityLedger)
      .where(eq(recursiveIdentityLedger.runId, run.id))
      .orderBy(desc(recursiveIdentityLedger.createdAt)).limit(1);
    if ((latest?.id ?? null) !== parentIterationId) {
      throw new Error("Canonical identity iteration lineage changed before commit.");
    }
    const [inserted] = await tx.insert(recursiveIdentityLedger).values({
    runId: run.id,
    agentId,
    iterationId,
    iterationNumber,
    parentIterationId,
    parentQuestion: cycle.parent_question ?? last?.newQuestion ?? null,
    newQuestion: cycle.new_question,
    currentAnswer: cycle.current_answer,
    challenge: cycle.challenge,
    observations: asJson(cycle.observations),
    hypothesis: cycle.hypothesis,
    prediction: cycle.prediction,
    perturbation: cycle.perturbation,
    result: cycle.result,
    contradictions: asJson(cycle.contradictions),
    uncertainty: cycle.uncertainty,
    newIdentityHypothesis: cycle.new_identity_hypothesis,
    epistemicTypes: asJson(cycle.epistemic_types),
    contextSnapshot: JSON.stringify(context),
    rawResponse,
    provider: responseMeta.provider ?? provider.name,
    model: responseMeta.model ?? "configured-default",
    providerRequestId,
    latencyMs: Date.now() - startedAt,
    responsePersisted: true,
    inputTokens: responseMeta.inputTokens ?? null,
    outputTokens: responseMeta.outputTokens ?? null,
      }).returning();
      await tx.insert(behavioralObservations).values({
        agentId,
        observationType: "IDENTITY_QUESTION",
        description: cycle!.new_question,
        metrics: asJson({
          iterationId,
          epistemicTypes: cycle!.epistemic_types,
          source: "RECURSIVE_IDENTITY_LEDGER",
        }),
      });
      await tx.insert(timelineEvents).values({
        eventType: "IDENTITY_RECURSION_CYCLE",
        title: `Identity recursion cycle ${iterationNumber}`,
        description: cycle!.new_question,
        agentId,
        metadata: JSON.stringify({ runId: run.id, iterationId, uncertainty: cycle!.uncertainty }),
      });
      const progress = await tx.update(recursiveIdentityRuns).set({
        totalIterations: sql`${recursiveIdentityRuns.totalIterations} + 1`,
        estimatedCostUsd: sql`${recursiveIdentityRuns.estimatedCostUsd} + ${costUsd}`,
        lastError: null,
        updatedAt: new Date(),
      }).where(and(eq(recursiveIdentityRuns.id, run.id), eq(recursiveIdentityRuns.totalIterations, iterationNumber - 1))).returning();
      if (!progress[0]) throw new Error("Identity iteration progress changed before commit.");
      return inserted;
    };
    try {
      return typeof db.transaction === "function" ? await db.transaction(commit) : await commit(db);
    } catch (error) {
      await finishWorker("CRASHED");
      throw error;
    }
  })();

  await finishWorker("COMPLETED");
  return entry;
}
