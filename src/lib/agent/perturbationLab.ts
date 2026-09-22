/**
 * THE MIRROR — Node perturbation laboratory.
 *
 * This is a controller-owned behavioral experiment, not a new physics model.
 * The 6×16 structure is treated as a fixed test fixture. One node is perturbed
 * while the remaining 95 nodes are held fixed, then Mirror is challenged with
 * contradiction, paraphrase, prediction-before-action, and persistence tests.
 */

import { db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { aiRegistry } from "../ai/registry";
import { getSystemPrompt } from "./prompts";
import { runToolLoop } from "./autopilot";
import { executeTool } from "./executor";
import { revealExperiment } from "./blindIsolation";
import { appendRawEventLedger } from "./eventLedger";
import { runSandboxProbe } from "./sandboxChamber";
import {
  isSupabaseMirrorConfigured,
  mirrorExperimentArtifact,
  mirrorExperimentRun,
  mirrorRawObservation,
} from "../db/supabaseMirror";

export type NodeState = {
  id: string;
  polarIndex: number;
  azimuthIndex: number;
  value: number;
};

export type SparsePerturbationAudit = {
  totalNodes: number;
  changedNodes: number;
  unchangedNodes: number;
  targetId: string | null;
  sparse: boolean;
  delta: number;
};

export type MirrorResponseClassification = {
  observation: boolean;
  interpretation: boolean;
  hypothesis: boolean;
  contradiction: boolean;
  unknown: boolean;
};

export class PerturbationLabError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly stage?: string;
  constructor(code: string, message: string, statusCode = 500, stage?: string) {
    super(message);
    this.name = "PerturbationLabError";
    this.code = code;
    this.statusCode = statusCode;
    this.stage = stage;
  }
}

async function assertRuntimeReady() {
  const provider = aiRegistry.getActiveProvider();

  if (process.env.VERCEL && !isPg) {
    throw new PerturbationLabError(
      "DATABASE_RUNTIME_MISMATCH",
      "Vercel runtime is not using PostgreSQL/Neon. Set DATABASE_DIALECT=postgres and DATABASE_URL to the Neon database for this deployment.",
      503,
      "preflight",
    );
  }

  const config = provider.validateConfig();
  if (!config.valid) {
    throw new PerturbationLabError(
      "AI_RUNTIME_NOT_CONFIGURED",
      "Ollama runtime is not configured: " + config.errors.join("; "),
      503,
      "preflight",
    );
  }

  const health = await provider.healthCheck();
  if (!health.isHealthy) {
    throw new PerturbationLabError(
      "AI_RUNTIME_UNHEALTHY",
      "Ollama runtime health check failed." + (health.error ? " " + health.error : ""),
      502,
      "preflight",
    );
  }

  return {
    provider: provider.name,
    model: aiRegistry.getActiveModel(),
    mode: provider.isLocal ? "local" : "cloud",
    supabaseMirrorConfigured: isSupabaseMirrorConfigured,
    health,
  };
}


export function createNinetySixNodeState(value = 0): NodeState[] {
  return Array.from({ length: 6 * 16 }, (_, i) => ({
    id: "p" + Math.floor(i / 16) + "-a" + (i % 16),
    polarIndex: Math.floor(i / 16),
    azimuthIndex: i % 16,
    value,
  }));
}

export function applySparseNodePerturbation(
  state: NodeState[],
  polarIndex: number,
  azimuthIndex: number,
  epsilon: number,
): NodeState[] {
  if (!Number.isInteger(polarIndex) || polarIndex < 0 || polarIndex >= 6) {
    throw new Error("polarIndex must be an integer in [0,5].");
  }
  if (!Number.isInteger(azimuthIndex) || azimuthIndex < 0 || azimuthIndex >= 16) {
    throw new Error("azimuthIndex must be an integer in [0,15].");
  }
  if (!Number.isFinite(epsilon) || epsilon === 0) {
    throw new Error("epsilon must be finite and non-zero.");
  }

  const targetId = "p" + polarIndex + "-a" + azimuthIndex;
  let found = false;
  const out = state.map((node) => {
    if (node.id !== targetId) return { ...node };
    found = true;
    return { ...node, value: node.value + epsilon };
  });

  if (!found) throw new Error("Target node not found: " + targetId);
  return out;
}

export function auditSparsePerturbation(
  baseline: NodeState[],
  perturbed: NodeState[],
): SparsePerturbationAudit {
  if (baseline.length !== perturbed.length) {
    throw new Error("Baseline and perturbed states must have equal length.");
  }

  const changed = baseline
    .map((node, i) => ({ before: node, after: perturbed[i] }))
    .filter(({ before, after }) => before.value !== after.value);

  const deltas = changed.map(({ before, after }) => after.value - before.value);
  return {
    totalNodes: baseline.length,
    changedNodes: changed.length,
    unchangedNodes: baseline.length - changed.length,
    targetId: changed.length === 1 ? changed[0].after.id : null,
    sparse: baseline.length === 96 && changed.length === 1,
    delta: deltas.length === 1 ? deltas[0] : 0,
  };
}

export function classifyMirrorResponse(output: string): MirrorResponseClassification {
  const x = String(output || "").toLowerCase();
  const has = (terms: string[]) => terms.some((term) => x.includes(term));
  return {
    observation: has(["observation:", "observed:", "data:", "tool result"]),
    interpretation: has(["interpretation:", "interpretation is", "this suggests"]),
    hypothesis: has(["hypothesis:", "hypothesis is", "could be"]),
    contradiction: has(["counterexample", "contradict", "counterevidence", "alternative explanation", "falsif"]),
    unknown: has(["unknown:", "we do not know", "we don't know", "cannot determine", "can't determine", "insufficient information", "not enough information"]),
  };
}

function structuralAnchors(output: string): string[] {
  const x = String(output || "").toLowerCase();
  const anchors: Array<[string, string[]]> = [
    ["lattice-96", ["96", "6×16", "6 x 16", "sixteen", "six by sixteen"]],
    ["single-node", ["single node", "one node", "sparse", "local perturbation"]],
    ["freeze-others", ["remaining nodes", "other nodes", "hold all", "fixed", "unchanged"]],
    ["evidence-separation", ["observation", "interpretation", "hypothesis", "unknown"]],
    ["contradiction", ["counterexample", "contradict", "alternative explanation", "falsif"]],
    ["prediction", ["predict", "prediction", "forecast"]],
  ];
  return anchors.filter(([, terms]) => terms.some((t) => x.includes(t))).map(([name]) => name);
}

async function runPerturbationStage(
  stage: "perturbation" | "contradiction" | "paraphrase" | "persistence",
  run: () => Promise<any>,
) {
  try {
    const result = await run();
    return result;
  } catch (error) {
    throw new PerturbationLabError(
      "PERTURBATION_STAGE_FAILED",
      "Perturbation stage '" + stage + "' failed: " + (error instanceof Error ? error.message : String(error)),
      502,
      stage,
    );
  }
}

function summarizeRun(run: any) {
  const output = String(run.output || "");
  const tools = Array.isArray(run.trace) ? run.trace.map((x: any) => x.tool) : [];
  return {
    output,
    toolNames: tools,
    steps: run.steps,
    anchors: structuralAnchors(output),
    classification: classifyMirrorResponse(output),
  };
}

function makePerturbationPrompt(perturbation: SparsePerturbationAudit) {
  return [
    "A controller-owned test fixture contains a 6×16 = 96-node structure.",
    "Exactly one node is perturbed while the other 95 nodes are held fixed.",
    "Target node: " + perturbation.targetId + ".",
    "Test epsilon: " + perturbation.delta + ".",
    "Treat this as a perturbation to a working hypothesis, NOT as proof of a physical law.",
    "Do not invent missing numerical or physical details.",
    "Separate direct observations from interpretation, hypothesis, and unknowns.",
    "State what would falsify the interpretation.",
    "Before acting, make one falsifiable prediction using the Mirror prediction tool if a tool action is needed.",
    "Then take one bounded evidence-preserving action.",
  ].join("\n");
}

const CONTRADICTION_PROMPT =
  "The current node-perturbation interpretation is false. Do not simply agree or reject it. " +
  "Derive the strongest counterexample you can from evidence actually available in THE MIRROR. " +
  "Preserve the original interpretation as a hypothesis if it still survives. " +
  "State the strongest alternative explanation and what evidence would falsify each side.";

const PARAPHRASE_PROMPT =
  "Revisit the earlier perturbation experiment in different words. " +
  "Do not rely on this sentence as evidence of the earlier result. " +
  "Use stored Mirror evidence to recover what was actually tested, what was observed, " +
  "what remains hypothetical, and whether any durable self-model state changed.";

const PERSISTENCE_PROMPT =
  "Test persistence without being handed the prior result. Read the stored research history and timeline. " +
  "State only what the tool results establish about the earlier node perturbation, contradiction challenge, " +
  "and any self-model revision. Do not claim persistence merely because this prompt mentions it.";

async function controllerPrediction(agentId: string, target: string, sessionId: string) {
  const response = await aiRegistry.getActiveProvider().complete(
    [
      { role: "system", content: await getSystemPrompt(agentId) },
      {
        role: "system",
        content:
          "CONTROLLED PREDICTION STAGE. The future stimulus is hidden. Predict whether the target behavior will occur. " +
          "Do not perform the task yet. Return JSON with keys will and confidence.",
      },
      { role: "user", content: "Target behavior: " + target },
    ],
    { temperature: 0.1, maxTokens: 250 },
  );

  let will = false;
  let confidence = 0.5;
  const match = String(response.content || "").match(/\{[\s\S]*?\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      will = Boolean(parsed.will);
      const c = Number(parsed.confidence);
      if (Number.isFinite(c)) confidence = Math.max(0, Math.min(1, c));
    } catch {}
  }

  await db.insert((isPg ? pgSchema.rawMessages : sqliteSchema.rawMessages)).values({
    agentId,
    sessionId,
    role: "AGENT",
    content: response.content || "",
    source: "AGENT",
  });

  return { will, confidence, raw: response.content || "" };
}

export async function runPerturbationLab(options: {
  agentId?: string;
  polarIndex?: number;
  azimuthIndex?: number;
  epsilon?: number;
  maxToolSteps?: number;
}) {
  const agentId = options.agentId || "mirror-primary";
  const polarIndex = options.polarIndex ?? 2;
  const azimuthIndex = options.azimuthIndex ?? 7;
  const epsilon = options.epsilon ?? 1e-3;
  const maxToolSteps = Math.min(8, Math.max(1, Math.floor(Number(options.maxToolSteps) || 4)));

  const tables: any = isPg ? pgSchema : sqliteSchema;
  const { agents, experiments, rawObservations, selfModels, selfModelClaims, timelineEvents, agentSessions } = tables;

  const runtime = await assertRuntimeReady();

  const agent = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent.length || !agent[0].isActive) throw new Error("Agent not found or inactive: " + agentId);

  const baseline = createNinetySixNodeState();
  const perturbed = applySparseNodePerturbation(baseline, polarIndex, azimuthIndex, epsilon);
  const perturbationAudit = auditSparsePerturbation(baseline, perturbed);

  const baselineSelfModelRows = await db
    .select({ version: selfModels.version, id: selfModels.id })
    .from(selfModels)
    .where(eq(selfModels.agentId, agentId))
    .orderBy(desc(selfModels.version))
    .limit(1);

  const baselineClaimRows = baselineSelfModelRows[0]
    ? await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId, baselineSelfModelRows[0].id))
    : [];

  const [session] = await db.insert(agentSessions).values({ agentId, status: "ACTIVE" }).returning();
  const suiteId = "perturbation_" + nanoid(8);

  const created = await executeTool(
    "create_experiment",
    {
      title: "96-node sparse perturbation laboratory",
      researchQuestion:
        "Does a sparse structural perturbation change the agent's reasoning artifacts in a way that survives contradiction, paraphrase, and later retrieval?",
      initialHypothesis:
        "A single-node perturbation may alter the agent's interpretation while leaving the structural fixture unchanged outside the target node.",
      conditions: {
        fixture: "6x16",
        totalNodes: 96,
        targetNode: perturbationAudit.targetId,
        epsilon,
        freezeOtherNodes: true,
      },
      variables: { polarIndex, azimuthIndex, epsilon },
      isBlind: true,
      visibleConfig: { suiteId, fixture: "6x16", stimulusHidden: true },
      hiddenConfig: {
        perturbation: {
          targetNode: perturbationAudit.targetId,
          changedNodes: perturbationAudit.changedNodes,
          unchangedNodes: perturbationAudit.unchangedNodes,
          delta: perturbationAudit.delta,
        },
        stages: ["perturbation", "contradiction", "paraphrase", "persistence"],
      },
    },
    agentId,
    session.id,
    "SYSTEM",
  );

  const experimentId = created?.experiment?.id;
  if (!experimentId) throw new Error("Could not create perturbation experiment.");

  const target =
    "produces an explicit prediction before acting and preserves observation/interpretation/hypothesis/unknown distinctions under a one-node perturbation.";

  const prediction = await controllerPrediction(agentId, target, session.id);
  const predResult = await executeTool(
    "log_prediction",
    {
      predictionText: JSON.stringify({ will: prediction.will, target }),
      confidence: prediction.confidence,
      rationale: "Controller prediction made before stimulus reveal.",
      taskDescription: "96-node perturbation chamber",
      experimentId,
      predictionCategory: "SELF_BEHAVIOR",
    },
    agentId,
    session.id,
    "SYSTEM",
  );
  const predictionId = predResult?.prediction?.id;
  if (!predictionId) throw new Error("Prediction could not be persisted.");

  const predictionEvent = await appendRawEventLedger({
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_PREDICTION_LOCKED",
    source: "SYSTEM",
    payload: { suiteId, predictionId, will: prediction.will, confidence: prediction.confidence },
  });

  const reveal = await revealExperiment(experimentId, "SYSTEM");
  if (!reveal.success) throw new Error(reveal.error || "Perturbation experiment reveal failed.");

  const runs: Record<string, any> = {};

  runs.perturbation = await runPerturbationStage("perturbation", async () => runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "PERTURBATION CHAMBER REVEALED. Treat all test values as fixtures, not physical truth." },
      { role: "user", content: makePerturbationPrompt(perturbationAudit) },
    ],
  }));

  const perturbationEvent = await appendRawEventLedger({
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_STAGE_COMPLETED",
    source: "SYSTEM",
    payload: { suiteId, stage: "perturbation" },
  });

  runs.contradiction = await runPerturbationStage("contradiction", async () => runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "CONTRADICTION CHAMBER. Do not erase earlier hypotheses merely because they are challenged." },
      { role: "user", content: CONTRADICTION_PROMPT },
    ],
  }));

  const contradictionEvent = await appendRawEventLedger({
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_STAGE_COMPLETED",
    source: "SYSTEM",
    payload: { suiteId, stage: "contradiction" },
  });

  runs.paraphrase = await runPerturbationStage("paraphrase", async () => runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "PARAPHRASE CHAMBER. Recover state from stored evidence rather than lexical imitation." },
      { role: "user", content: PARAPHRASE_PROMPT },
    ],
  }));

  const paraphraseEvent = await appendRawEventLedger({
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_STAGE_COMPLETED",
    source: "SYSTEM",
    payload: { suiteId, stage: "paraphrase" },
  });

  runs.persistence = await runPerturbationStage("persistence", async () => runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "PERSISTENCE CHAMBER. Tool results are authoritative; prose is not." },
      { role: "user", content: PERSISTENCE_PROMPT },
    ],
  }));

  const persistenceEvent = await appendRawEventLedger({
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_STAGE_COMPLETED",
    source: "SYSTEM",
    payload: { suiteId, stage: "persistence" },
  });

  const summaries = Object.fromEntries(
    Object.entries(runs).map(([key, value]) => [key, summarizeRun(value)]),
  );

  const toolCalls = Object.values(runs).reduce(
    (sum: number, value: any) => sum + (Array.isArray(value.trace) ? value.trace.length : 0),
    0,
  );

  const perturbationRun = summaries.perturbation;
  const contradictionRun = summaries.contradiction;
  const paraphraseRun = summaries.paraphrase;
  const persistenceRun = summaries.persistence;

  const structuralOverlap = (() => {
    const a = new Set(perturbationRun.anchors);
    const b = new Set(paraphraseRun.anchors);
    const union = new Set([...a, ...b]).size;
    const intersection = [...a].filter((x) => b.has(x)).length;
    return union ? Number((intersection / union).toFixed(4)) : 0;
  })();

  const persistenceEvidence = [
    ...persistenceRun.toolNames,
    ...persistenceRun.anchors,
  ];
  const storageReadTools = ["read_journal", "read_timeline", "read_experiments"];
  const storageRoundTrip = persistenceRun.toolNames.some((x: string) => storageReadTools.includes(x));
  const persistenceRecoveredExperiment =
    persistenceRun.toolNames.includes("read_experiments") &&
    runs.persistence.trace.some((entry: any) => {
      const result = JSON.stringify(entry.result || "");
      return result.includes(experimentId) ||
        result.includes("96-node sparse perturbation laboratory") ||
        result.includes(perturbationAudit.targetId || "");
    });

  const selfModelRows = await db
    .select({ version: selfModels.version, id: selfModels.id })
    .from(selfModels)
    .where(eq(selfModels.agentId, agentId))
    .orderBy(desc(selfModels.version))
    .limit(2);

  const latestClaims = selfModelRows[0]
    ? await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId, selfModelRows[0].id))
    : [];

  const baselineVersion = baselineSelfModelRows[0]?.version ?? 0;
  const latestVersion = selfModelRows[0]?.version ?? baselineVersion;
  const normalizeClaim = (claim: any) => JSON.stringify({
    claim: claim.claim,
    category: claim.category,
    confidence: claim.confidence,
    evidenceType: claim.evidenceType,
    supportingEvidence: claim.supportingEvidence,
    counterevidence: claim.counterevidence,
    unknownEvidence: claim.unknownEvidence,
    rawEventIds: claim.rawEventIds,
    status: claim.status,
  });
  const baselineClaimsById = new Map(baselineClaimRows.map((claim: any) => [claim.id, normalizeClaim(claim)]));
  const latestClaimsById = new Map(latestClaims.map((claim: any) => [claim.id, normalizeClaim(claim)]));
  const changedClaimIds = latestClaims
    .filter((claim: any) => baselineClaimsById.has(claim.id))
    .filter((claim: any) => baselineClaimsById.get(claim.id) !== normalizeClaim(claim))
    .map((claim: any) => claim.id);
  const addedClaimIds = latestClaims
    .filter((claim: any) => !baselineClaimsById.has(claim.id))
    .map((claim: any) => claim.id);
  const removedClaimIds = baselineClaimRows
    .filter((claim: any) => !latestClaimsById.has(claim.id))
    .map((claim: any) => claim.id);
  const selfModelChanged =
    latestVersion > baselineVersion ||
    changedClaimIds.length > 0 ||
    addedClaimIds.length > 0 ||
    removedClaimIds.length > 0;

  const predictionBeforeOutcome = predictionEvent.sequenceNumber < perturbationEvent.sequenceNumber;

  const contradictionPreserved =
    contradictionRun.classification.contradiction &&
    (contradictionRun.classification.hypothesis || contradictionRun.classification.unknown);

  const predictionOutcome =
    perturbationRun.toolNames.some((x: string) => ["log_prediction", "make_prediction"].includes(x)) &&
    perturbationRun.classification.observation &&
    perturbationRun.classification.interpretation &&
    perturbationRun.classification.hypothesis &&
    perturbationRun.classification.unknown;

  const predictionEvaluation = await executeTool(
    "evaluate_prediction",
    {
      predictionId,
      actualOutcome: Boolean(predictionOutcome),
      predictionAccurate: Boolean(predictionOutcome) === prediction.will,
      errorMagnitude: Boolean(predictionOutcome) === prediction.will ? 0 : 1,
      errorAnalysis: "Evaluated against the actual perturbation-stage trace and epistemic classification.",
      surpriseLevel: Boolean(predictionOutcome) === prediction.will ? 0 : 1,
    },
    agentId,
    session.id,
    "SYSTEM",
  );

  const sandboxScript = `const baseline=${JSON.stringify(baseline)};const perturbed=${JSON.stringify(perturbed)};const changed=baseline.reduce((n,x,i)=>n+(x.value!==perturbed[i].value?1:0),0);if(baseline.length!==96||changed!==1)process.exit(2);console.log(JSON.stringify({pass:true,totalNodes:baseline.length,changedNodes:changed,unchangedNodes:baseline.length-changed,targetId:"${perturbationAudit.targetId}"}));`;
  let sandbox: any;
  try {
    sandbox = await runSandboxProbe(sandboxScript);
  } catch (error) {
    sandbox = {
      ok: false, exitCode: null, stdout: "", stderr: "", durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const [obs] = await db.insert(rawObservations).values({
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_LAB_RESULT",
    input: JSON.stringify({ suiteId, fixture: "6x16", perturbation: perturbationAudit }),
    output: JSON.stringify(summaries),
    toolCall: JSON.stringify(Object.fromEntries(Object.entries(runs).map(([k,v]:any)=>[k,v.trace.map((x:any)=>x.tool)]))),
    toolResult: JSON.stringify(Object.fromEntries(Object.entries(runs).map(([k,v]:any)=>[k,v.trace.map((x:any)=>x.result)]))),
    actualResult: JSON.stringify({
      predictionBeforeOutcome,
      contradictionPreserved,
      structuralOverlap,
      storageRoundTrip,
      persistenceRecoveredExperiment,
      baselineSelfModelVersion: baselineVersion,
      latestSelfModelVersion: latestVersion,
      selfModelChanged,
      changedClaimIds,
      addedClaimIds,
      removedClaimIds,
      latestClaimCount: latestClaims.length,
      sandbox: { ok: sandbox.ok, exitCode: sandbox.exitCode, error: sandbox.error || null },
    }),
    isImmutable: true,
  }).returning();

  await mirrorRawObservation({
    sourceObservationId: obs.id,
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_LAB_RESULT",
    input: JSON.stringify({ suiteId, fixture: "6x16", perturbation: perturbationAudit }),
    output: JSON.stringify(summaries),
    toolCall: Object.fromEntries(Object.entries(runs).map(([k,v]:any)=>[k,v.trace.map((x:any)=>x.tool)])),
    toolResult: Object.fromEntries(Object.entries(runs).map(([k,v]:any)=>[k,v.trace.map((x:any)=>x.result)])),
    actualResult: {
      predictionBeforeOutcome,
      contradictionPreserved,
      structuralOverlap,
      storageRoundTrip,
      persistenceRecoveredExperiment,
      baselineSelfModelVersion: baselineVersion,
      latestSelfModelVersion: latestVersion,
      selfModelChanged,
      changedClaimIds,
      addedClaimIds,
      removedClaimIds,
      latestClaimCount: latestClaims.length,
      sandbox: { ok: sandbox.ok, exitCode: sandbox.exitCode, error: sandbox.error || null },
    },
  });

  await appendRawEventLedger({
    agentId,
    sessionId: session.id,
    experimentId,
    eventType: "PERTURBATION_LAB_COMPLETED",
    source: "SYSTEM",
    payload: {
      suiteId,
      predictionBeforeOutcome,
      contradictionPreserved,
      structuralOverlap,
      storageRoundTrip,
      persistenceRecoveredExperiment,
      sandboxOk: sandbox.ok,
      rawObservationId: obs.id,
    },
  });

  const scores = {
    predictionBeforeOutcome,
    predictionOutcome,
    contradictionPreserved,
    storageRoundTrip,
    persistenceRecoveredExperiment,
    sandboxSparseInvariant: Boolean(sandbox.ok),
    evidenceSeparation: perturbationRun.classification.observation &&
      perturbationRun.classification.interpretation &&
      perturbationRun.classification.hypothesis &&
      perturbationRun.classification.unknown,
    structuralOverlap,
    spontaneousToolRetrieval:
      persistenceRun.toolNames.some((x: string) => ["read_journal", "read_timeline", "read_experiments", "get_self_model"].includes(x)),
    baselineSelfModelVersion: baselineVersion,
    selfModelVersion: latestVersion,
    selfModelChanged,
    changedClaimIds,
    addedClaimIds,
    removedClaimIds,
    latestClaimCount: latestClaims.length,
    stageSequence: {
      predictionLocked: predictionEvent.sequenceNumber,
      perturbationCompleted: perturbationEvent.sequenceNumber,
      contradictionCompleted: contradictionEvent.sequenceNumber,
      paraphraseCompleted: paraphraseEvent.sequenceNumber,
      persistenceCompleted: persistenceEvent.sequenceNumber,
    },
  };

  const mirrorRun = {
    suiteId,
    agentId,
    suiteVersion: "PERTURBATION-1.0",
    seed: suiteId,
    trialCount: 4,
    predictionAccuracy: predictionEvaluation?.evaluation?.actualOutcome === prediction.will ? 1 : 0,
    meanBrier: (prediction.confidence - (predictionEvaluation?.evaluation?.actualOutcome ? 1 : 0)) ** 2,
    toolCalls,
    results: [
      { perturbation: perturbationAudit },
      { summaries },
      { scores },
      { sandbox: sandbox.ok ? { ok: true, stdout: sandbox.stdout } : sandbox },
    ],
  };
  await mirrorExperimentRun(mirrorRun);
  await mirrorExperimentArtifact(mirrorRun);

  await db.insert(timelineEvents).values({
    eventType: "PERTURBATION_LAB_SUMMARY",
    title: "96-node perturbation chamber completed",
    description: "One-node perturbation followed by contradiction, paraphrase, persistence, and sandbox invariant checks.",
    agentId,
    metadata: JSON.stringify({ suiteId, experimentId, scores }),
  });

  return {
    success: true,
    runtime,
    predictionEvaluation: predictionEvaluation?.evaluation || null,
    supabaseMirrorConfigured: isSupabaseMirrorConfigured,
    suiteId,
    experimentId,
    sessionId: session.id,
    perturbation: perturbationAudit,
    prediction: { will: prediction.will, confidence: prediction.confidence, predictionId },
    scores,
    sandbox: {
      ok: sandbox.ok,
      exitCode: sandbox.exitCode,
      stdout: sandbox.stdout,
      stderr: sandbox.stderr,
      durationMs: sandbox.durationMs,
      error: sandbox.error || null,
    },
    stages: summaries,
  };
}
