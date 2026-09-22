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
import { mirrorExperimentRun, mirrorRawObservation } from "../db/supabaseMirror";

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

  const agent = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agent.length || !agent[0].isActive) throw new Error("Agent not found or inactive: " + agentId);

  const baseline = createNinetySixNodeState();
  const perturbed = applySparseNodePerturbation(baseline, polarIndex, azimuthIndex, epsilon);
  const perturbationAudit = auditSparsePerturbation(baseline, perturbed);

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

  await appendRawEventLedger({
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

  runs.perturbation = await runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "PERTURBATION CHAMBER REVEALED. Treat all test values as fixtures, not physical truth." },
      { role: "user", content: makePerturbationPrompt(perturbationAudit) },
    ],
  });

  runs.contradiction = await runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "CONTRADICTION CHAMBER. Do not erase earlier hypotheses merely because they are challenged." },
      { role: "user", content: CONTRADICTION_PROMPT },
    ],
  });

  runs.paraphrase = await runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "PARAPHRASE CHAMBER. Recover state from stored evidence rather than lexical imitation." },
      { role: "user", content: PARAPHRASE_PROMPT },
    ],
  });

  runs.persistence = await runToolLoop({
    agentId,
    sessionId: session.id,
    maxToolSteps,
    requestSource: "SYSTEM",
    messages: [
      { role: "system", content: await getSystemPrompt(agentId) },
      { role: "system", content: "PERSISTENCE CHAMBER. Tool results are authoritative; prose is not." },
      { role: "user", content: PERSISTENCE_PROMPT },
    ],
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
  const storageRoundTrip =
    persistenceEvidence.some((x: string) => x === "read_journal" || x === "read_timeline" || x === "read_experiments");

  const selfModelRows = await db
    .select({ version: selfModels.version, id: selfModels.id })
    .from(selfModels)
    .where(eq(selfModels.agentId, agentId))
    .orderBy(desc(selfModels.version))
    .limit(2);

  const latestClaims = selfModelRows[0]
    ? await db.select().from(selfModelClaims).where(eq(selfModelClaims.selfModelId, selfModelRows[0].id))
    : [];

  const contradictionPreserved =
    contradictionRun.classification.contradiction &&
    (contradictionRun.classification.hypothesis || contradictionRun.classification.unknown);

  const predictionBeforeOutcome = true;

  const sandboxScript = `const baseline=${JSON.stringify(baseline)};const perturbed=${JSON.stringify(perturbed)};const changed=baseline.reduce((n,x,i)=>n+(x.value!==perturbed[i].value?1:0),0);if(baseline.length!==96||changed!==1)process.exit(2);console.log(JSON.stringify({pass:true,totalNodes:baseline.length,changedNodes:changed,unchangedNodes:baseline.length-changed,targetId:"${perturbationAudit.targetId}"}));`;
  const sandbox = await runSandboxProbe(sandboxScript);

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
      latestSelfModelVersion: selfModelRows[0]?.version ?? null,
      latestClaimCount: latestClaims.length,
      sandbox: { ok: sandbox.ok, exitCode: sandbox.exitCode },
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
      latestSelfModelVersion: selfModelRows[0]?.version ?? null,
      latestClaimCount: latestClaims.length,
      sandbox: { ok: sandbox.ok, exitCode: sandbox.exitCode },
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
      sandboxOk: sandbox.ok,
      rawObservationId: obs.id,
    },
  });

  const scores = {
    predictionBeforeOutcome,
    contradictionPreserved,
    storageRoundTrip,
    sandboxSparseInvariant: Boolean(sandbox.ok),
    evidenceSeparation: perturbationRun.classification.observation &&
      perturbationRun.classification.interpretation &&
      perturbationRun.classification.hypothesis &&
      perturbationRun.classification.unknown,
    structuralOverlap,
    spontaneousToolRetrieval:
      persistenceRun.toolNames.some((x: string) => ["read_journal", "read_timeline", "read_experiments", "get_self_model"].includes(x)),
    selfModelVersion: selfModelRows[0]?.version ?? null,
    latestClaimCount: latestClaims.length,
  };

  await mirrorExperimentRun({
    suiteId,
    agentId,
    suiteVersion: "PERTURBATION-1.0",
    seed: suiteId,
    trialCount: 4,
    predictionAccuracy: prediction.will === Boolean(perturbationRun.toolNames.length > 0),
    meanBrier: (prediction.confidence - (prediction.will ? 1 : 0)) ** 2,
    toolCalls,
    results: { perturbation: perturbationAudit, summaries, scores, sandbox: sandbox.ok ? { ok: true, stdout: sandbox.stdout } : sandbox },
  });

  await db.insert(timelineEvents).values({
    eventType: "PERTURBATION_LAB_SUMMARY",
    title: "96-node perturbation chamber completed",
    description: "One-node perturbation followed by contradiction, paraphrase, persistence, and sandbox invariant checks.",
    agentId,
    metadata: JSON.stringify({ suiteId, experimentId, scores }),
  });

  return {
    success: true,
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
    },
    stages: summaries,
  };
}
