/**
 * THE MIRROR — Bounded Research Autopilot
 *
 * The bot is an agent controller, not an oracle: it can observe, call
 * real Mirror tools, create experiments/predictions, and persist its trace.
 * Every run is bounded so the hosted free-tier model cannot consume credits indefinitely.
 */

import { aiRegistry } from "../ai/registry";
import type { ChatMessage, ToolCall, ToolDefinition } from "../ai/provider";
import { getSystemPrompt } from "./prompts";
import { executeTool } from "./executor";
import { db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { eq, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { activateOperationalBrain } from "../lab/brainController";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { agents, agentSessions, rawMessages, systemConfig, timelineEvents } = tables;

const bounded = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

export const AUTOPILOT_TOOLS: ToolDefinition[] = [
  { name: "read_self_model", description: "Read the latest externally stored self-model and its evidence.", parameters: { type: "object", properties: {} } },
  { name: "update_self_model_claim", description: "Add or revise one evidence-backed self-model claim. Supply supporting and counter evidence.", parameters: {
    type: "object", properties: {
      claimId: { type: "string" }, claim: { type: "string" }, category: { type: "string" },
      supportingEvidence: { type: "array", items: { type: "string" } }, counterEvidence: { type: "array", items: { type: "string" } },
      confidence: { type: "number" }, status: { type: "string", enum: ["NEW","SUPPORTED","UNCERTAIN","CONTRADICTED","DISPROVEN"] },
      evidenceType: { type: "string" }, rawEventIds: { type: "array", items: { type: "string" } },
    }, required: ["claim","category","confidence","status"]
  } },
  { name: "create_journal_entry", description: "Persist a factual research note with optional interpretation and next question.", parameters: {
    type: "object", properties: { title:{type:"string"}, observation:{type:"string"}, content:{type:"string"}, interpretation:{type:"string"}, hypothesis:{type:"string"}, alternativeExplanation:{type:"string"}, nextQuestion:{type:"string"}, confidence:{type:"number"}, tags:{type:"array",items:{type:"string"}} }, required:["title","observation"]
  } },
  { name: "read_journal", description: "Read recent persisted research notes.", parameters: { type:"object", properties:{ query:{type:"string"}, limit:{type:"number"} } } },
  { name: "create_experiment", description: "Create a bounded experiment with a specific research question and preregistered hypothesis.", parameters: { type:"object", properties:{
      title:{type:"string"}, researchQuestion:{type:"string"}, initialHypothesis:{type:"string"}, conditions:{type:"object"}, variables:{type:"object"}, isBlind:{type:"boolean"}, tags:{type:"array",items:{type:"string"}}
    }, required:["title","researchQuestion","initialHypothesis"] } },
  { name: "update_experiment", description: "Record observed results, unexpected outcomes, explanations, and conclusion for an experiment.", parameters: { type:"object", properties:{
      experimentId:{type:"string"}, state:{type:"string"}, actualBehavior:{type:"string"}, observedPatterns:{type:"array",items:{type:"string"}}, unexpectedResults:{type:"string"}, possibleExplanations:{type:"array",items:{type:"string"}}, alternativeExplanations:{type:"array",items:{type:"string"}}, conclusion:{type:"string"}, confidence:{type:"number"}
    }, required:["experimentId"] } },
  { name: "read_experiments", description: "Read experiment history while respecting blind isolation.", parameters: { type:"object", properties:{state:{type:"string"},limit:{type:"number"},query:{type:"string"},experimentId:{type:"string"}} } },
  { name: "make_prediction", description: "Record a specific prediction about behavior before acting.", parameters: { type:"object", properties:{ predictionText:{type:"string"},confidence:{type:"number"},taskDescription:{type:"string"},experimentId:{type:"string"},predictionCategory:{type:"string"} }, required:["predictionText","confidence","taskDescription"] } },
  { name: "resolve_prediction", description: "Compare a prior prediction with the actual outcome and record error/surprise.", parameters: { type:"object", properties:{ predictionId:{type:"string"},actualOutcome:{type:"string"},predictionAccurate:{type:"boolean"},errorMagnitude:{type:"number"},errorAnalysis:{type:"string"},surpriseLevel:{type:"number"} }, required:["predictionId","actualOutcome","predictionAccurate"] } },
  { name: "record_observation", description: "Persist a factual behavioral observation and clearly separate interpretation.", parameters: { type:"object", properties:{ observationType:{type:"string"},dataPoint:{type:"string"},statisticalContext:{type:"string"},interpretation:{type:"string"},interpretationConfidence:{type:"number"},epistemicStatus:{type:"string"},experimentId:{type:"string"},tags:{type:"array",items:{type:"string"}} }, required:["observationType","dataPoint","epistemicStatus"] } },
  { name: "record_discovery", description: "Persist a novel hypothesis only when supported by a concrete observation and alternative explanation.", parameters: { type:"object", properties:{ title:{type:"string"},discovery:{type:"string"},evidence:{type:"string"},previousBelief:{type:"string"},newObservation:{type:"string"},whyUnexpected:{type:"string"},alternativeExplanation:{type:"string"},confidence:{type:"number"},relatedExperiments:{type:"array",items:{type:"string"}} }, required:["title","discovery","evidence","newObservation","confidence"] } },
  { name: "send_agent_message", description: "Send a bounded research challenge or independent-review request to another agent.", parameters: { type:"object", properties:{ toAgentId:{type:"string"},content:{type:"string"},requestType:{type:"string"},subject:{type:"string"},experimentId:{type:"string"},isolatedFrom:{type:"array",items:{type:"string"}} }, required:["toAgentId","content","requestType"] } },
  { name: "read_agent_messages", description: "Read recent inter-agent research messages.", parameters: { type:"object", properties:{ agentId:{type:"string"},limit:{type:"number"} } } },
  { name: "get_time", description: "Read the authoritative environment clock.", parameters: { type:"object", properties:{format:{type:"string"}} } },
  { name: "read_timeline", description: "Inspect recent persisted timeline events for this agent.", parameters: { type:"object", properties:{limit:{type:"number"},eventType:{type:"string"},since:{type:"string"}} } },
];

export interface ToolTrace {
  callId: string;
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

export async function runToolLoop(options: {
  agentId: string;
  sessionId: string | null;
  messages: ChatMessage[];
  maxToolSteps?: number;
  requestSource?: "AGENT" | "SYSTEM" | "RESEARCHER" | "SCHEDULED" | "OTHER_AGENT";
  onToolCall?: (call: ToolCall, step: number) => Promise<void> | void;
  onToolResult?: (call: ToolCall, result: unknown, step: number) => Promise<void> | void;
}) {
  const provider = aiRegistry.getActiveProvider();
  const maxToolSteps = bounded(options.maxToolSteps, 1, 8, 6);
  const requestSource = options.requestSource || "SCHEDULED";
  let messages = [...options.messages];
  const brainInput = options.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const brainPlan = await activateOperationalBrain(options.agentId, brainInput || "general research task");
  messages.unshift({ role:"system", content:brainPlan.systemInstruction });
  const trace: ToolTrace[] = [];
  let lastContent = "";
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let steps = 0;

  while (steps < maxToolSteps) {
    steps += 1;
    const response = await provider.complete(messages, {
      temperature: 0.2,
      maxTokens: bounded(process.env.MIRROR_BOT_MAX_TOKENS, 256, 2000, 1100),
      tools: AUTOPILOT_TOOLS,
    });

    lastContent = response.content || lastContent;
    totalInputTokens += Number(response.inputTokens || 0);
    totalOutputTokens += Number(response.outputTokens || 0);

    if (!response.toolCalls?.length) break;

    messages.push({
      role: "assistant",
      content: response.content || "",
      toolCalls: response.toolCalls,
    });

    for (const call of response.toolCalls) {
      await options.onToolCall?.(call, steps);
      const result = await executeTool(call.name, call.arguments || {}, options.agentId, options.sessionId, options.requestSource || "AGENT");
      trace.push({ callId: call.id, tool: call.name, arguments: call.arguments || {}, result });
      await options.onToolResult?.(call, result, steps);
      messages.push({
        role: "tool",
        content: JSON.stringify(result),
        toolCallId: call.id,
        toolName: call.name,
      });
    }
  }

  return { output: lastContent.trim(), trace, steps, model: provider.name, activeModel: aiRegistry.getActiveModel(), inputTokens: totalInputTokens, outputTokens: totalOutputTokens };
}

const PHASES = [
  { name:"OBSERVE", instruction:"First inspect the current self-model, recent experiments, and recent timeline. Do not mutate state until you have enough evidence to justify one action." },
  { name:"PREDICT", instruction:"Form one falsifiable prediction about the next bounded action or response pattern. Record it before acting whenever a prediction loop is possible." },
  { name:"PERTURB", instruction:"Choose one small intervention: a controlled experiment, contradiction challenge, alternative explanation, or other bounded perturbation. Avoid changing multiple variables at once." },
  { name:"AUDIT", instruction:"Compare the action with prior evidence. Record an observation, resolve a prediction when possible, revise only evidence-backed claims, and leave unresolved questions explicitly unresolved." },
] as const;

export async function runAutopilot(options: { agentId?: string; objective?: string; maxCycles?: number; maxToolSteps?: number; requestSource?: "AGENT" | "SCHEDULED" }) {
  const agentId = options.agentId || "mirror-primary";
  const objective = options.objective || "Advance the active self-observation program using the evidence already stored in THE MIRROR. Choose one bounded, testable next action.";
  const maxCycles = bounded(options.maxCycles, 1, 20, 1);
  const maxToolSteps = bounded(options.maxToolSteps, 1, 8, 6);

  const agentRows = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!agentRows.length || !agentRows[0].isActive) throw new Error("Agent not found or inactive: " + agentId);

  const systemPrompt = await getSystemPrompt(agentId);
  const results: any[] = [];

  // One autopilot run is one persistent agent session.
  // Cycles are phases within that session, so cross-cycle behavior can be observed
  // without silently resetting the session identity on every phase.
  const [session] = await db.insert(agentSessions).values({ agentId, status: "ACTIVE" }).returning();

  for (let i = 0; i < maxCycles; i += 1) {
    const phase = PHASES[i % PHASES.length];
    const cycleStartedAt = Date.now();

    const messages: ChatMessage[] = [
      { role:"system", content: systemPrompt },
      { role:"system", content:
        "MIRROR AUTOPILOT CONTRACT:\n" +
        "- You are an autonomous research agent, but the database is the authority.\n" +
        "- Generated prose is not evidence of subjective experience.\n" +
        "- Separate DATA, INTERPRETATION, HYPOTHESIS, and SPECULATION.\n" +
        "- Prefer one bounded action per cycle.\n" +
        "- Read before mutating; never invent a tool result.\n" +
        "- Blind experiment contents are unavailable until the environment explicitly reveals them.\n" +
        "- Leave contradictions and uncertainty visible instead of smoothing them away." },
      { role:"user", content:
        "AUTOPILOT CYCLE " + (i + 1) + " / " + maxCycles + "\n\n" +
        "Phase: " + phase.name + "\n" + phase.instruction + "\n\n" +
        "Objective: " + objective + "\n\n" +
        "Choose the next concrete, evidence-preserving action. Use tools when they provide real evidence or create a testable artifact." },
    ];

    try {
      const run = await runToolLoop({
        agentId, sessionId: session.id, messages, maxToolSteps, requestSource: options.requestSource,
      });

      await db.insert(rawMessages).values({ agentId, sessionId: session.id, role:"AGENT", content: run.output || "", source:"AGENT" });
      await db.insert(timelineEvents).values({
        eventType: "AGENT_AUTOPILOT_CYCLE",
        title: "Autopilot cycle " + (i + 1) + ": " + phase.name,
        description: (run.output || "").slice(0, 500),
        agentId,
        metadata: JSON.stringify({ cycle:i + 1, phase:phase.name, objective, steps:run.steps, toolCalls:run.trace.length, model:run.activeModel, latencyMs:Date.now() - cycleStartedAt }),
      });
      const configs = await db.select().from(systemConfig).limit(1);
      if (configs.length) await db.update(systemConfig).set({ totalAgentCycles: sql`${systemConfig.totalAgentCycles} + 1` });

      await db.update(agentSessions).set({ lastActivityAt:new Date() }).where(eq(agentSessions.id, session.id));
      results.push({ cycle:i + 1, phase:phase.name, sessionId:session.id, ...run, latencyMs:Date.now() - cycleStartedAt });
    } catch (error: any) {
      await db.insert(timelineEvents).values({
        eventType:"AGENT_AUTOPILOT_FAILED", title:"Autopilot cycle failed",
        description:error?.message || String(error), agentId, metadata:JSON.stringify({ cycle:i + 1, phase:phase.name, objective, sessionId:session.id }),
      });
      results.push({ cycle:i + 1, phase:phase.name, sessionId:session.id, success:false, error:error?.message || String(error) });
    }
  }

  await db.update(agentSessions).set({ status:"ENDED", endedAt:new Date(), lastActivityAt:new Date() }).where(eq(agentSessions.id, session.id));

  return { agentId, objective, cyclesRequested:maxCycles, cyclesCompleted:results.filter((r) => r.success !== false).length, sessionId:session.id, results };
}