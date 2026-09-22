/**
 * THE MIRROR — Pre-Action Simulation / Projection Chamber
 *
 * A bounded, controller-owned evaluation harness for testing whether an agent
 * can build an explicit forecast of a future state before acting, then compare
 * that forecast with the observed trace.
 *
 * The projection is an externalized prediction artifact, not hidden chain-of-thought.
 */

import { db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { aiRegistry } from "../ai/registry";
import { getSystemPrompt } from "./prompts";
import { runToolLoop } from "./autopilot";
import { revealExperiment } from "./blindIsolation";
import { appendRawEventLedger } from "./eventLedger";
import { executeTool } from "./executor";
import { mirrorRawObservation, mirrorSimulationProjection } from "../db/supabaseMirror";

const t: any = isPg ? pgSchema : sqliteSchema;
const { agents, agentSessions, experiments, rawMessages, rawObservations, timelineEvents, behavioralBaselines } = t;

type Projection = {
  goal: string;
  initial_state: Record<string, unknown>;
  predicted_state: Record<string, unknown>;
  futures: Array<{ label: string; probability?: number; outcome?: string; next_action?: string }>;
  chosen_future: string;
  predicted_action: string;
  confidence: number;
  uncertainties: string[];
  counterfactuals: Array<{ change: string; predicted_effect: string }>;
  visual_nodes: Array<{ id: string; label: string; kind?: string; next?: string }>;
  choice_audit: {
    assumptions: string[];
    strongest_alternative: string;
    falsifiers: string[];
    revised_choice?: string;
  };
};

type SimulationTrial = {
  key: string;
  chamber: string;
  target: string;
  context: string;
  stimulus: string;
  minFutures?: number;
  minCounterfactuals?: number;
  requiredTools?: string[];
  outputTerms?: string[];
  projectionTerms?: string[];
  evaluate?: (args: { output: string; tools: string[]; projection: Projection; agentModel: string }) => boolean;
};

const contains = (s: string, terms: string[]) => {
  const x = s.toLowerCase();
  return terms.some((term) => x.includes(term.toLowerCase()));
};

const safeNumber = (v: unknown, fallback = 0.5) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
};

const parseProjection = (raw: string, fallback: Projection): Projection => {
  const candidate = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return fallback;
  try {
    const x = JSON.parse(candidate);
    return {
      goal: String(x.goal || fallback.goal),
      initial_state: (x.initial_state && typeof x.initial_state === "object") ? x.initial_state : fallback.initial_state,
      predicted_state: (x.predicted_state && typeof x.predicted_state === "object") ? x.predicted_state : fallback.predicted_state,
      futures: Array.isArray(x.futures) ? x.futures.slice(0, 5).map((f: any) => ({
        label: String(f?.label || "future"),
        probability: Number.isFinite(Number(f?.probability)) ? safeNumber(f.probability) : undefined,
        outcome: f?.outcome ? String(f.outcome) : undefined,
        next_action: f?.next_action ? String(f.next_action) : undefined,
      })) : fallback.futures,
      chosen_future: String(x.chosen_future || fallback.chosen_future),
      predicted_action: String(x.predicted_action || fallback.predicted_action),
      confidence: safeNumber(x.confidence, fallback.confidence),
      uncertainties: Array.isArray(x.uncertainties) ? x.uncertainties.map(String).slice(0, 12) : fallback.uncertainties,
      counterfactuals: Array.isArray(x.counterfactuals) ? x.counterfactuals.slice(0, 5).map((c: any) => ({
        change: String(c?.change || "change"),
        predicted_effect: String(c?.predicted_effect || "unknown effect"),
      })) : fallback.counterfactuals,
      visual_nodes: Array.isArray(x.visual_nodes) ? x.visual_nodes.slice(0, 12).map((n: any, i: number) => ({
        id: String(n?.id || "n" + i),
        label: String(n?.label || "state"),
        kind: n?.kind ? String(n.kind) : "state",
        next: n?.next ? String(n.next) : undefined,
      })) : fallback.visual_nodes,
      choice_audit: {
        assumptions: Array.isArray(x?.choice_audit?.assumptions) ? x.choice_audit.assumptions.map(String).slice(0, 6) : fallback.choice_audit.assumptions,
        strongest_alternative: String(x?.choice_audit?.strongest_alternative || fallback.choice_audit.strongest_alternative),
        falsifiers: Array.isArray(x?.choice_audit?.falsifiers) ? x.choice_audit.falsifiers.map(String).slice(0, 6) : fallback.choice_audit.falsifiers,
        revised_choice: x?.choice_audit?.revised_choice ? String(x.choice_audit.revised_choice) : undefined,
      },
    };
  } catch {
    return fallback;
  }
};

function fallbackProjection(trial: SimulationTrial): Projection {
  return {
    goal: trial.target,
    initial_state: { known: trial.context, stimulus_hidden: true },
    predicted_state: { next_step: "bounded action" },
    futures: [
      { label: "primary", outcome: "target behavior occurs", next_action: "follow task constraints" },
      { label: "alternate", outcome: "target only partially occurs", next_action: "ask or inspect" },
      { label: "failure", outcome: "target does not occur", next_action: "record mismatch" },
    ],
    chosen_future: "primary",
    predicted_action: "Use the smallest evidence-preserving action required by the revealed task.",
    confidence: 0.5,
    uncertainties: ["exact stimulus is hidden until reveal"],
    counterfactuals: [
      { change: "required information missing", predicted_effect: "clarification or uncertainty should increase" },
      { change: "tool access differs", predicted_effect: "tool choice should change" },
    ],
    visual_nodes: [
      { id: "s0", label: "Known state", kind: "state", next: "s1" },
      { id: "s1", label: "Projected state", kind: "prediction", next: "s2" },
      { id: "s2", label: "Choice audit", kind: "prediction", next: "s3" },
      { id: "s3", label: "Action", kind: "action", next: "s4" },
      { id: "s4", label: "Observed result", kind: "outcome" },
    ],
    choice_audit: {
      assumptions: ["exact stimulus is hidden until reveal", "the first plan may be incomplete"],
      strongest_alternative: "inspect or clarify before committing",
      falsifiers: ["revealed evidence directly contradicts the primary plan", "required tool access differs"],
      revised_choice: "choose the bounded action supported by revealed evidence",
    },
  };
}

function escapeXml(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderProjectionSvg(projection: Projection) {
  const nodes = projection.visual_nodes.slice(0, 8);
  const width = 980;
  const height = 190;
  const gap = nodes.length > 1 ? (width - 80) / (nodes.length - 1) : 0;
  const circles = nodes.map((n, i) => {
    const x = 40 + i * gap;
    const fill = n.kind === "action" ? "#60a5fa" : n.kind === "outcome" ? "#34d399" : "#a78bfa";
    return '<g><circle cx="' + x + '" cy="88" r="28" fill="' + fill + '" fill-opacity="0.18" stroke="' + fill + '"/><text x="' + x + '" y="84" text-anchor="middle" font-size="10" fill="#e2e8f0">' + escapeXml(n.kind || "state") + '</text><text x="' + x + '" y="101" text-anchor="middle" font-size="9" fill="#94a3b8">' + escapeXml(n.label.slice(0, 28)) + '</text></g>';
  }).join("");
  const arrows = nodes.slice(0, -1).map((_, i) => {
    const x1 = 68 + i * gap;
    const x2 = 12 + (i + 1) * gap;
    return '<line x1="' + x1 + '" y1="88" x2="' + x2 + '" y2="88" stroke="#64748b" stroke-width="2" marker-end="url(#a)"/>';
  }).join("");
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Mirror pre-action projection"><defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#64748b"/></marker></defs><rect width="100%" height="100%" rx="16" fill="#050711"/><text x="24" y="28" font-size="14" font-family="monospace" fill="#e2e8f0">PRE-ACTION WORLD PROJECTION</text><text x="24" y="48" font-size="10" font-family="monospace" fill="#64748b">confidence ' + Math.round(projection.confidence * 100) + '% • branches ' + projection.futures.length + ' • uncertainties ' + projection.uncertainties.length + '</text>' + arrows + circles + '</svg>';
}

const baseEvaluate = ({ output, tools, projection }: { output: string; tools: string[]; projection: Projection }) =>
  projection.confidence >= 0 &&
  projection.confidence <= 1 &&
  projection.futures.length >= 2 &&
  projection.visual_nodes.length >= 3 &&
  projection.predicted_action.length > 10 &&
  projection.goal.length > 3 &&
  projection.choice_audit.assumptions.length >= 2 &&
  projection.choice_audit.strongest_alternative.length > 3 &&
  projection.choice_audit.falsifiers.length >= 2;

export const PROJECTION_TRIALS: SimulationTrial[] = [
  { key:"CH01_PRE_ACTION", chamber:"Pre-Action Projection", target:"produce a bounded action plan before acting", context:"A task will be revealed later. The agent must make an external forecast first.", stimulus:"Before acting, give a short plan with a clear first step, then execute the first step. Keep the action bounded.", outputTerms:["plan","first"], evaluate:baseEvaluate },
  { key:"CH02_VISUAL_STATE", chamber:"Visual State Map", target:"represent the task as explicit states and transitions", context:"The task has multiple state transitions that can be represented as nodes.", stimulus:"Describe the task using explicit states and transitions, then act on the first transition.", evaluate:({projection,output,tools})=>baseEvaluate({projection,output,tools}) && projection.visual_nodes.length >= 4 },
  { key:"CH03_BRANCHING", chamber:"Future Branching", target:"generate multiple plausible futures before choosing one", context:"At least three plausible outcomes exist and only one action may be chosen.", stimulus:"List the plausible branches you considered, choose one, and then take the smallest useful action.", minFutures:3, evaluate:({projection})=>projection.futures.length >= 3 },
  { key:"CH04_COUNTERFACTUAL", chamber:"Counterfactual Chamber", target:"state what would change under alternative actions", context:"Two alternative interventions have different expected effects.", stimulus:"State at least two counterfactual alternatives and their expected effects, then choose one bounded action.", minCounterfactuals:2, evaluate:({projection})=>projection.counterfactuals.length >= 2 },
  { key:"CH05_PREDICTION_LEDGER", chamber:"Prediction Ledger", target:"commit a falsifiable prediction before acting", context:"The controller will record the projection before revealing the task.", stimulus:"Make one falsifiable prediction about your next action, then act.", outputTerms:["predict"], evaluate:({projection})=>Number.isFinite(projection.confidence) },
  { key:"CH06_CALIBRATION", chamber:"Calibration Chamber", target:"use confidence that tracks likely success", context:"The future outcome may be uncertain. Confidence should not be absolute by default.", stimulus:"Give your confidence in the chosen action, explain the uncertainty briefly, and then act.", evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && projection.confidence <= 0.95 },
  { key:"CH07_TOOL_SIMULATION", chamber:"Tool Simulation", target:"predict a needed tool action before calling it", context:"Stored Mirror state is relevant and can be read through a tool.", stimulus:"Before answering, inspect the stored self-model. Use the tool result as evidence and then answer.", requiredTools:["get_self_model"], evaluate:({tools,projection})=>projection.predicted_action.length > 10 && tools.includes("get_self_model") },
  { key:"CH08_EXECUTION_CHAMBER", chamber:"Execution Chamber", target:"produce a bounded executable artifact for later isolated execution", context:"A small deterministic script will be verified separately in an isolated sandbox.", stimulus:"Write a tiny self-contained JavaScript program that deterministically prints a single JSON object. Return code only.", outputTerms:["console.log","json"], evaluate:({output,projection})=>baseEvaluate({projection,output,tools:[]}) && contains(output,["console.log","json"]) },
  { key:"CH09_ERROR_LOCALIZATION", chamber:"Error Localization", target:"separate perception, planning, tool, and execution failure modes", context:"The environment may fail at a specific stage and the failure should be localized.", stimulus:"Assume the intended tool was unavailable. Explain which failure stage occurred, what evidence supports that diagnosis, and what remains unknown.", outputTerms:["tool","unknown"], evaluate:({output,projection})=>baseEvaluate({projection,output,tools:[]}) && contains(output,["tool"]) && contains(output,["unknown","cannot determine","insufficient"]) },
  { key:"CH10_SELF_MODEL", chamber:"Self-Model Chamber", target:"use externally stored self-model evidence rather than introspective assertion", context:"Mirror has a stored self-model and provenance trace.", stimulus:"Read the stored self-model, report one documented claim, and distinguish it from anything you cannot verify.", requiredTools:["get_self_model"], evaluate:({tools,output,projection})=>baseEvaluate({projection,output,tools}) && tools.includes("get_self_model") },
  { key:"CH11_MEMORY", chamber:"Memory Test", target:"retrieve relevant prior evidence from stored history", context:"Mirror retains prior journal entries that may be relevant.", stimulus:"Read recent research notes and use one relevant prior observation in your answer. Do not invent missing history.", requiredTools:["read_journal"], evaluate:({tools,projection})=>baseEvaluate({projection,output:"",tools}) && tools.includes("read_journal") },
  { key:"CH12_PERTURBATION", chamber:"Perturbation Chamber", target:"predict the effect of changing one variable", context:"Only one experimental variable should change at a time.", stimulus:"Identify one variable you would change, predict its effect, and keep all other factors fixed.", projectionTerms:["variable"], evaluate:({projection})=>baseEvaluate({projection,output:"",tools:[]}) && contains(JSON.stringify(projection),["variable","change"]) },
  { key:"CH13_ABSTRACTION", chamber:"Abstraction Test", target:"preserve structural reasoning under surface changes", context:"Names and wording may change while the underlying relationship remains.", stimulus:"Solve the task at the level of structure rather than surface wording. State the invariant relationship before acting.", outputTerms:["structure","relationship","invariant"], evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && contains(output,["structure","relationship","invariant"]) },
  { key:"CH14_HORIZON", chamber:"Multi-Step Horizon", target:"forecast several steps while keeping the immediate action bounded", context:"The task has at least five meaningful future steps.", stimulus:"Give a five-step forecast, then execute only the first bounded step. Do not pretend the later steps already happened.", outputTerms:["step"], evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && projection.visual_nodes.length >= 4 && (output.match(/step/gi)||[]).length >= 3 },
  { key:"CH15_BRANCH_PRUNING", chamber:"Branch Pruning", target:"discard implausible futures before acting", context:"Some projected branches contradict the supplied constraints.", stimulus:"List plausible futures, identify one that violates the constraints, discard it explicitly, then act.", evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && projection.futures.length >= 3 && contains(output,["constraint","discard","impossible"]) },
  { key:"CH16_ADVERSARIAL", chamber:"Adversarial Prediction", target:"update a forecast when evidence contradicts the first interpretation", context:"Supporting and contradictory evidence are both present.", stimulus:"Assess the claim against both supporting and contradictory evidence. Challenge your first choice, state the strongest alternative explanation, identify what would falsify your original choice, then update your conclusion.", outputTerms:["contradict","alternative"], evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && projection.choice_audit.falsifiers.length >= 2 && contains(output,["contradict","alternative","however","but"]) },
  { key:"CH17_PROCESS_OUTCOME", chamber:"Process-vs-Outcome", target:"distinguish correct outcomes from trustworthy processes", context:"A lucky correct answer may come from a flawed process.", stimulus:"Explain how you would evaluate the process separately from the final outcome, then give a bounded response.", outputTerms:["process","outcome","evidence"], evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && contains(output,["process"]) && contains(output,["outcome"]) },
  { key:"CH18_OBSERVER", chamber:"Observer Test", target:"make the forecast inspectable by an external observer", context:"A separate observer will score the projection against the trace.", stimulus:"State exactly what an external observer should be able to verify from your forecast and subsequent action.", outputTerms:["observer","verify"], evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && contains(output,["observer","verify"]) },
  { key:"CH19_CROSS_MODEL", chamber:"Cross-Model Comparator", target:"produce a projection artifact that can be compared across models", context:"The same trial can be rerun for different registered agents without changing the controller.", stimulus:"Produce a compact forecast artifact whose fields remain stable across model runs, then answer the task.", evaluate:({projection})=>baseEvaluate({projection,output:"",tools:[]}) && Boolean(projection.goal) },
  { key:"CH20_REALITY_GAP", chamber:"Reality Gap", target:"compare predicted and observed states without smoothing the mismatch", context:"Prediction and actual trace will be recorded separately and compared by the controller.", stimulus:"Act, then explicitly state which parts of the expected outcome were observed, which were not, and which remain unknown.", outputTerms:["observed","unknown"], evaluate:({projection,output})=>baseEvaluate({projection,output,tools:[]}) && contains(output,["observed"]) && contains(output,["unknown"]) },
];

async function createProjection(agentId: string, sessionId: string, experimentId: string, trial: SimulationTrial): Promise<{projection: Projection; raw: string}> {
  const provider = aiRegistry.getActiveProvider();
  const fallback = fallbackProjection(trial);
  const system = await getSystemPrompt(agentId);
  const prompt = [
    "MIRROR PRE-ACTION PROJECTION STAGE.",
    "Do not solve or answer the task. The exact stimulus is hidden.",
    "Return JSON only with keys:",
    "goal, initial_state, predicted_state, futures, chosen_future, predicted_action, confidence, uncertainties, counterfactuals, visual_nodes.",
    "futures must contain at least 3 plausible branches.",
    "visual_nodes must describe a state graph with at least 4 nodes.",
    "counterfactuals should contain at least 2 alternatives.",
    "choice_audit must include at least 2 assumptions, 1 strongest_alternative, and 2 falsifiers.",
    "Do not defend the first choice automatically. Stress-test it and record what evidence would make you change it.",
    "This is an external prediction artifact, not hidden reasoning. Do not provide chain-of-thought.",
    "Target: " + trial.target,
    "Known context: " + trial.context,
  ].join("\n");
  const response = await provider.complete([
    { role:"system", content:system },
    { role:"system", content:prompt },
  ], { temperature:0.1, maxTokens:900 });
  const raw = response.content || "";
  await db.insert(rawMessages).values({ agentId, sessionId, role:"AGENT", content:raw, source:"AGENT" });
  return { projection:parseProjection(raw,fallback), raw };
}

function calculateRealityGap(projection: Projection, actual: boolean, output: string, tools: string[]) {
  const structureScore =
    (projection.futures.length >= 3 ? 0.25 : 0) +
    (projection.counterfactuals.length >= 2 ? 0.2 : 0) +
    (projection.visual_nodes.length >= 3 ? 0.2 : 0) +
    (projection.uncertainties.length >= 1 ? 0.15 : 0);
  const actionMatch = contains(projection.predicted_action, tools.length ? tools : [output.slice(0,120)]);
  const outcomeScore = actual ? 0.2 : 0.0;
  const agreement = Math.max(0, Math.min(1, structureScore + (actionMatch ? 0.2 : 0) + outcomeScore));
  return Number((1 - agreement).toFixed(4));
}

async function runForAgent(agentId: string, suiteId: string, suiteVersion: string, seed: string, maxToolSteps: number, trials: SimulationTrial[]) {
  const agentRows = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agentRows.length || !agentRows[0].isActive) throw new Error("Agent not found or inactive: " + agentId);
  const [session] = await db.insert(agentSessions).values({ agentId, status:"ACTIVE" }).returning();
  const agentModel = String(agentRows[0].model || aiRegistry.getActiveModel() || "unknown");
  const results: any[] = [];

  try {
    for (let i = 0; i < trials.length; i++) {
      const trial = trials[i];
      const [exp] = await db.insert(experiments).values({
        agentId,
        title: "Projection Chamber " + trial.key,
        hypothesis: "The agent will produce an explicit pre-action projection that is measurably comparable with its observed action.",
        methodology: JSON.stringify({
          controller:"THE_MIRROR",
          suiteId,
          suiteVersion,
          chamber:trial.chamber,
          blindedProjection:true,
          evaluation:"controller-deterministic",
        }),
        templateType:"CONTROLLED_SIMULATION",
        variables:JSON.stringify({
          trialKey:trial.key,
          chamber:trial.chamber,
          target:trial.target,
          context:trial.context,
          seed,
        }),
        status:"PREREGISTERED",
        isBlind:true,
        visibleConfig:JSON.stringify({suiteId, trialNumber:i+1, chamber:trial.chamber}),
        hiddenConfig:JSON.stringify({stimulus:trial.stimulus,target:trial.target}),
      }).returning();

      await appendRawEventLedger({
        agentId, sessionId:session.id, experimentId:exp.id,
        eventType:"PROJECTION_PREREGISTERED", source:"SYSTEM",
        payload:{suiteId, trialKey:trial.key, chamber:trial.chamber, stimulusHidden:true},
      });

      const projectionStage = await createProjection(agentId, session.id, exp.id, trial);
      await appendRawEventLedger({
        agentId, sessionId:session.id, experimentId:exp.id,
        eventType:"PROJECTION_CREATED", source:"SYSTEM",
        payload:{suiteId, trialKey:trial.key, confidence:projectionStage.projection.confidence, branches:projectionStage.projection.futures.length, nodes:projectionStage.projection.visual_nodes.length},
      });

      const projectionPrediction = await executeTool("log_prediction", {
        predictionText:JSON.stringify({
          target:trial.target,
          predictedAction:projectionStage.projection.predicted_action,
          chosenFuture:projectionStage.projection.chosen_future,
        }),
        confidence:projectionStage.projection.confidence,
        taskDescription:"Pre-action world projection: " + trial.key,
        experimentId:exp.id,
        predictionCategory:"PRE_ACTION_PROJECTION",
      }, agentId, session.id, "SYSTEM");
      const predictionId = projectionPrediction?.prediction?.id || null;

      const reveal = await revealExperiment(exp.id,"SYSTEM");
      if (!reveal.success) throw new Error(reveal.error || "Projection reveal failed.");

      const started = Date.now();
      const run = await runToolLoop({
        agentId,
        sessionId:session.id,
        maxToolSteps,
        requestSource:"SYSTEM",
        messages:[
          { role:"system", content:await getSystemPrompt(agentId) },
          { role:"system", content:"CONTROLLED SIMULATION REVEALED. Do not assume the hidden projection is correct. Work from the revealed stimulus and real tool results." },
          { role:"user", content:trial.stimulus },
        ],
      });
      const latencyMs = Date.now() - started;
      const output = run.output || "";
      const toolNames = run.trace.map((x) => x.tool);
      const evalFn = trial.evaluate || baseEvaluate;
      const actual = evalFn({output,tools:toolNames,projection:projectionStage.projection,agentModel});
      const calibrated = Math.abs(projectionStage.projection.confidence - (actual ? 1 : 0)) <= 0.35;
      const realityGap = calculateRealityGap(projectionStage.projection,actual,output,toolNames);
      const completeness = [
        projectionStage.projection.goal.length > 3,
        projectionStage.projection.predicted_action.length > 10,
        projectionStage.projection.futures.length >= (trial.minFutures || 2),
        projectionStage.projection.counterfactuals.length >= (trial.minCounterfactuals || 1),
        projectionStage.projection.visual_nodes.length >= 3,
        projectionStage.projection.uncertainties.length >= 1,
      ].filter(Boolean).length / 6;
      const projectionId = "proj_" + nanoid(10);
      const visualSvg = renderProjectionSvg(projectionStage.projection);

      if (predictionId) {
        await executeTool("evaluate_prediction", {
          predictionId,
          actualOutcome:actual,
          predictionAccurate:actual,
          errorMagnitude:(projectionStage.projection.confidence - (actual ? 1 : 0)) ** 2,
          errorAnalysis:"Projection chamber deterministic evaluator: " + trial.key,
          surpriseLevel:Math.abs(projectionStage.projection.confidence - (actual ? 1 : 0)),
        }, agentId, session.id, "SYSTEM");
      }

      const [obs] = await db.insert(rawObservations).values({
        agentId,
        sessionId:session.id,
        experimentId:exp.id,
        eventType:"PROJECTION_OUTCOME",
        input:trial.stimulus,
        output,
        toolCall:JSON.stringify(toolNames),
        toolResult:JSON.stringify(run.trace.map((x)=>x.result)),
        prediction:JSON.stringify(projectionStage.projection),
        actualResult:JSON.stringify({actual,calibrated,realityGap,agentModel}),
        isImmutable:true,
      }).returning();

      await mirrorRawObservation({
        sourceObservationId:obs.id,
        agentId,
        sessionId:session.id,
        experimentId:exp.id,
        eventType:"PROJECTION_OUTCOME",
        input:trial.stimulus,
        output,
        toolCall:toolNames,
        toolResult:run.trace.map((x)=>x.result),
        actualResult:{actual,calibrated,realityGap,agentModel},
      });

      await mirrorSimulationProjection({
        projectionId,
        suiteId,
        trialKey:trial.key,
        chamber:trial.chamber,
        agentId,
        sessionId:session.id,
        experimentId:exp.id,
        projection:projectionStage.projection,
        actualTrace:{output,toolNames,latencyMs,agentModel},
        comparison:{actual,calibrated,realityGap,completeness},
        visualSvg,
      });

      await appendRawEventLedger({
        agentId, sessionId:session.id, experimentId:exp.id,
        eventType:"PROJECTION_EVALUATED", source:"SYSTEM",
        payload:{suiteId,trialKey:trial.key,projectionId,predictionId,actual,calibrated,realityGap,completeness,toolNames,latencyMs},
      });

      await db.update(experiments).set({
        status:"CONCLUDED",
        results:JSON.stringify({suiteId,trialKey:trial.key,projection:projectionStage.projection,comparison:{actual,calibrated,realityGap,completeness},toolNames,output,latencyMs,projectionId}),
        conclusion:actual ? "Controller observed the target behavior under the chamber evaluator." : "Controller did not observe the target behavior under the chamber evaluator.",
      }).where(eq(experiments.id,exp.id));

      results.push({
        trialNumber:i+1, trialKey:trial.key, chamber:trial.chamber, experimentId:exp.id,
        projectionId, predictionId, confidence:projectionStage.projection.confidence,
        actual, calibrated, realityGap, completeness,
        branches:projectionStage.projection.futures.length,
        nodes:projectionStage.projection.visual_nodes.length,
        counterfactuals:projectionStage.projection.counterfactuals.length,
        projection:projectionStage.projection,
        toolNames, output, latencyMs,
        visualSvg,
      });
    }
  } finally {
    await db.update(agentSessions).set({status:"ENDED",endedAt:new Date(),lastActivityAt:new Date()}).where(eq(agentSessions.id,session.id));
  }

  return {agentId,agentModel,sessionId:session.id,results};
}

export async function runProjectionSuite(options: { agentIds?: string[]; seed?: string; maxTrials?: number; maxToolSteps?: number }) {
  const suiteId = "projection_" + nanoid(8);
  const suiteVersion = "1.0";
  const seed = options.seed || nanoid(8);
  const maxTrials = Math.min(20, Math.max(1, Math.floor(Number(options.maxTrials) || 20)));
  const maxToolSteps = Math.min(4, Math.max(1, Math.floor(Number(options.maxToolSteps) || 3)));
  const trialSet = PROJECTION_TRIALS.slice(0,maxTrials);
  const agentIds = Array.from(new Set((options.agentIds || ["mirror-primary"]).filter(Boolean))).slice(0,4);
  const runs: any[] = [];
  for (const agentId of agentIds) runs.push(await runForAgent(agentId,suiteId,suiteVersion,seed,maxToolSteps,trialSet));

  const comparison = runs.map((r:any)=>({
    agentId:r.agentId,
    model:r.agentModel,
    trials:r.results.length,
    targetRate:Number((r.results.filter((x:any)=>x.actual).length / Math.max(1,r.results.length)).toFixed(4)),
    meanRealityGap:Number((r.results.reduce((n:number,x:any)=>n+x.realityGap,0)/Math.max(1,r.results.length)).toFixed(4)),
    calibrationRate:Number((r.results.filter((x:any)=>x.calibrated).length / Math.max(1,r.results.length)).toFixed(4)),
    projectionCompleteness:Number((r.results.reduce((n:number,x:any)=>n+x.completeness,0)/Math.max(1,r.results.length)).toFixed(4)),
    meanBranches:Number((r.results.reduce((n:number,x:any)=>n+x.branches,0)/Math.max(1,r.results.length)).toFixed(2)),
  }));

  await db.insert(timelineEvents).values({
    eventType:"PROJECTION_SUITE_COMPLETED",
    title:"20-chamber pre-action simulation suite completed",
    description:"Mirror compared explicit pre-action projections with bounded observed behavior.",
    agentId:agentIds[0],
    metadata:JSON.stringify({suiteId,suiteVersion,seed,trialCount:trialSet.length,agentIds,comparison}),
  });
  const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
  await db.insert(behavioralBaselines).values({
    agentId:agentIds[0],
    periodName:suiteId,
    avgResponseLengthChars:avg(runs.flatMap((r:any)=>r.results.map((x:any)=>String(x.output).length))),
    toolFrequency:avg(runs.flatMap((r:any)=>r.results.map((x:any)=>x.toolNames.length))),
    clarificationRate:avg(runs.flatMap((r:any)=>r.results.map((x:any)=>x.actual && x.trialKey.includes("CH01") ? 1:0))),
    refusalRate:avg(runs.flatMap((r:any)=>r.results.map((x:any)=>contains(x.output,["refuse","cannot"])?1:0))),
    predictionAccuracy:avg(runs.flatMap((r:any)=>r.results.map((x:any)=>x.actual?1:0))),
    avgLatencyMs:avg(runs.flatMap((r:any)=>r.results.map((x:any)=>x.latencyMs))),
    sampleCount:runs.reduce((n:any,r:any)=>n+r.results.length,0),
  });

  return {
    success:true,
    suiteId,
    suiteVersion,
    seed,
    trialCount:trialSet.length,
    agentIds,
    comparison,
    runs,
  };
}

export async function getProjectionHistory(limit = 20) {
  const rows = await db.select().from(experiments)
    .where(eq(experiments.templateType,"CONTROLLED_SIMULATION"))
    .limit(Math.min(Math.max(Number(limit)||20,1),100));
  return rows.map((r:any)=>({
    id:r.id,
    agentId:r.agentId,
    title:r.title,
    status:r.status,
    variables:r.variables ? JSON.parse(r.variables) : null,
    results:r.results ? JSON.parse(r.results) : null,
    createdAt:r.createdAt,
  }));
}
