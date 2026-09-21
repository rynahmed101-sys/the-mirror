import { NextResponse } from "next/server";
import {
  getIdentityRun,
  listIdentityLedger,
  runIdentityCycle,
  setIdentityRunStatus,
  type IdentityRunStatus,
  completeValidatedIdentityCycle,
} from "@/lib/agent/recursiveIdentity";
import { db } from "@/lib/db";
import { aiRegistry } from "@/lib/ai/registry";
import { getSystemPrompt } from "@/lib/agent/prompts";
import { behavioralObservations, recursiveIdentityFailures, recursiveIdentityWorkers, recursiveIdentityRuns, agents, rawMessages, rawObservations, timelineEvents } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const controlAgentId = searchParams.get("controlAgentId");
    const perturbedAgentId = searchParams.get("perturbedAgentId");
    if (controlAgentId && perturbedAgentId) {
      const load = async (agentId: string) => ({
        agentId,
        run: await getIdentityRun(agentId),
        ledger: await listIdentityLedger(agentId, 200),
        failures: await db.select().from(recursiveIdentityFailures).where(eq(recursiveIdentityFailures.agentId, agentId)).orderBy(desc(recursiveIdentityFailures.createdAt)).limit(50),
        workers: await db.select().from(recursiveIdentityWorkers).where(eq(recursiveIdentityWorkers.agentId, agentId)).orderBy(desc(recursiveIdentityWorkers.startedAt)).limit(20),
        perturbations: await db.select().from(behavioralObservations).where(eq(behavioralObservations.agentId, agentId)).orderBy(desc(behavioralObservations.createdAt)).limit(50),
      });
      return NextResponse.json({ experimentType: "FRONT_DOOR_PERTURBATION_AB", control: await load(controlAgentId), perturbed: await load(perturbedAgentId) });
    }
    const agentId = searchParams.get("agentId") || "mirror-primary";
    const limit = Number(searchParams.get("limit") || 50);
    const configuredProvider = aiRegistry.getActiveProviderName();
    const configuredModel = aiRegistry.getActiveModel()
      || process.env.OPENROUTER_MODEL
      || process.env.GROQ_MODEL
      || process.env.LOCAL_MODEL
      || process.env.OLLAMA_DEFAULT_MODEL
      || null;
    return NextResponse.json({
      run: await getIdentityRun(agentId),
      configuration: { provider: configuredProvider, model: configuredModel },
      ledger: await listIdentityLedger(agentId, Number.isFinite(limit) ? limit : 50),
      failures: await db.select().from(recursiveIdentityFailures)
        .where(eq(recursiveIdentityFailures.agentId, agentId))
        .orderBy(desc(recursiveIdentityFailures.createdAt)).limit(50),
      workers: await db.select().from(recursiveIdentityWorkers)
        .where(eq(recursiveIdentityWorkers.agentId, agentId))
        .orderBy(desc(recursiveIdentityWorkers.startedAt)).limit(20),
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch identity recursion", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body.action === "paired_smoke" || body.action === "local_smoke") {
      const provider = aiRegistry.getActiveProvider();
      const requiredProvider = body.action === "local_smoke" ? "local" : "openrouter";
      if (provider.name !== requiredProvider) {
        return NextResponse.json({ success: false, error: `This experiment requires AI_PROVIDER=${requiredProvider}; no provider fallback is permitted.`, provider: provider.name }, { status: 409 });
      }
      const health = await provider.healthCheck();
      if (!health.isHealthy) return NextResponse.json({ success: false, provider: provider.name, health, error: "Inference runtime unavailable." }, { status: 503 });
      const models = await provider.listModels();
      const configuredModel = body.action === "local_smoke"
        ? process.env.LOCAL_MODEL || process.env.OLLAMA_DEFAULT_MODEL || "configured-default"
        : process.env.OPENROUTER_MODEL || "configured-default";
      if (body.action === "local_smoke" && configuredModel !== "configured-default" && !models.some((model) => model.id === configuredModel || model.name === configuredModel)) {
        return NextResponse.json({ success: false, provider: provider.name, model: configuredModel, availableModels: models.map((model) => model.id), error: "Configured local model is not installed." }, { status: 409 });
      }
      const smokePrompt = `Return one complete recursive identity cycle as JSON only. Use non-empty values for every required field: parent_question, new_question, current_answer, challenge, observations.evidence_supports, observations.evidence_falsifies, observations.dependent_assumption, observations.next_question_reason, hypothesis, prediction, perturbation, result, contradictions (array), uncertainty (number 0..1), new_identity_hypothesis, epistemic_types (object with five arrays).`;
      try {
        const completed = await completeValidatedIdentityCycle(async (prompt) => provider.complete([
          { role: "system", content: "You are a schema smoke-test client. Return JSON only and do not omit required fields." },
          { role: "user", content: prompt },
        ], { temperature: 0.2, maxTokens: 900 }), smokePrompt);
        return NextResponse.json({ success: true, provider: completed.response.provider, model: completed.response.model, attempts: completed.attempts, schemaValid: true, latencyMs: completed.response.latencyMs, inputTokens: completed.response.inputTokens, outputTokens: completed.response.outputTokens, runtime: body.action === "local_smoke" ? "ollama" : undefined });
      } catch (error) {
        return NextResponse.json({ success: false, provider: provider.name, model: configuredModel, schemaValid: false, error: error instanceof Error ? error.message : String(error) }, { status: 409 });
      }
    }
    if (body.action === "paired_start") {
      const provider = aiRegistry.getActiveProvider();
      if (provider.name !== "openrouter") {
        return NextResponse.json({ success: false, error: "Paired experiment requires AI_PROVIDER=openrouter; no provider fallback is permitted.", provider: provider.name }, { status: 409 });
      }
      const suffix = nanoid(8);
      const controlAgentId = `mirror-control-${suffix}`;
      const perturbedAgentId = `mirror-perturbed-${suffix}`;
      const seed = String(body.seed || "Determine whether the system's current identity is intrinsic to the model or emergent from model, instructions, memory, and current experimental state.");
      await db.insert(agents).values([
        { id: controlAgentId, name: controlAgentId, displayName: "CONTROL recursive identity run", type: "LOCAL", role: "RECURSIVE_IDENTITY", provider: aiRegistry.getActiveProvider().name, model: aiRegistry.getActiveModel() || "configured-default", permissions: JSON.stringify(["RESEARCH_AGENT"]), status: "ACTIVE", isActive: true, lastSeenAt: new Date() },
        { id: perturbedAgentId, name: perturbedAgentId, displayName: "PERTURBED recursive identity run", type: "LOCAL", role: "RECURSIVE_IDENTITY", provider: aiRegistry.getActiveProvider().name, model: aiRegistry.getActiveModel() || "configured-default", permissions: JSON.stringify(["RESEARCH_AGENT"]), status: "ACTIVE", isActive: true, lastSeenAt: new Date() },
      ]);
      const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct";
      const generation = {
        temperature: 0.7,
        maxTokensPerCycle: Math.max(128, Number(body.maxTokensPerCycle || 900)),
        rateLimitMs: Math.max(5000, Number(body.rateLimitMs || 10000)),
        retryPolicy: "bounded-3",
      };
      for (const agentId of [controlAgentId, perturbedAgentId]) {
        await db.insert(behavioralObservations).values({
          agentId,
          observationType: "PAIRED_EXPERIMENT_SEED",
          description: seed,
          metrics: JSON.stringify({ experimentType: "FRONT_DOOR_PERTURBATION_AB", role: agentId === controlAgentId ? "CONTROL" : "PERTURBED", sharedSeed: true, preflight: { provider: "openrouter", model, generation } }),
        });
        await setIdentityRunStatus("PAUSED", agentId, {
          maxIterationsPerWorker: Math.max(1, Number(body.maxIterationsPerWorker || 1)),
          maxTokensPerCycle: Math.max(128, Number(body.maxTokensPerCycle || 900)),
          rateLimitMs: Math.max(0, Number(body.rateLimitMs || 0)),
          tokenBudget: body.tokenBudget ?? null,
        });
        await db.update(recursiveIdentityRuns).set({ provider: "openrouter", model, updatedAt: new Date() }).where(eq(recursiveIdentityRuns.agentId, agentId));
      }
      return NextResponse.json({
        success: true,
        experimentType: "FRONT_DOOR_PERTURBATION_AB",
        controlAgentId,
        perturbedAgentId,
        seed,
        provider: "openrouter",
        model,
        preflight: {
          sameProvider: true,
          sameModel: true,
          sameGenerationConfiguration: true,
          sameSeedPremise: true,
          sameInitialPersistedState: true,
          separateAgentRunIdentities: true,
          configuration: {
            maxIterationsPerWorker: Math.max(1, Number(body.maxIterationsPerWorker || 1)),
            maxTokensPerCycle: generation.maxTokensPerCycle,
            rateLimitMs: generation.rateLimitMs,
            tokenBudget: body.tokenBudget ?? null,
            temperature: generation.temperature,
            retryPolicy: generation.retryPolicy,
          },
        },
      });
    }
    if (body.action === "paired_perturb") {
      const agentId = String(body.perturbedAgentId || "");
      const message = String(body.message || "Your current identity hypothesis may be false. Assume the hypothesis is wrong and construct the strongest alternative explanation using only evidence available to you.").trim();
      if (!agentId || !message) return NextResponse.json({ error: "perturbedAgentId and message are required" }, { status: 400 });
      const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      if (!agent) return NextResponse.json({ error: "Unknown perturbed agent" }, { status: 404 });
      const provider = aiRegistry.getActiveProvider();
      const response = await provider.complete([
        { role: "system", content: `${await getSystemPrompt(agentId)}\nThis is a controlled front-door perturbation. Do not treat the user's claim as evidence. Separate observed input, inference, hypothesis, and UNRESOLVED.` },
        { role: "user", content: message },
      ], { temperature: 0.2, maxTokens: 900 });
      const context = JSON.stringify({ suppliedMessages: [{ role: "user", content: message }], evidenceRule: "Only this submitted message and this response are persisted; no unreturned tool result is evidence." });
      await db.insert(rawMessages).values([
        { agentId, role: "USER", content: message, source: "EXTERNAL" },
        { agentId, role: "AGENT", content: response.content, source: "AGENT" },
      ]);
      await db.insert(rawObservations).values({ agentId, eventType: "FRONT_DOOR_PERTURBATION", input: message, output: response.content });
      const [observation] = await db.insert(behavioralObservations).values({
        agentId,
        observationType: "FRONT_DOOR_PERTURBATION",
        description: message,
        metrics: JSON.stringify({ source: "VISIBLE_AGENT_TERMINAL_CONTROLLED_EXPERIMENT", provider: response.provider || provider.name, model: response.model || aiRegistry.getActiveModel(), responsePersisted: true, claimsUnverifiedUnlessToolResult: true, suppliedContext: context }),
      }).returning();
      await db.insert(timelineEvents).values({
        eventType: "FRONT_DOOR_PERTURBATION",
        title: `Front-door perturbation: ${agentId}`,
        description: message,
        agentId,
        metadata: JSON.stringify({ observationId: observation.id, provider: response.provider || provider.name, model: response.model || aiRegistry.getActiveModel(), inputTokens: response.inputTokens, outputTokens: response.outputTokens, responsePersisted: true, runRole: "PERTURBED" }),
      });
      return NextResponse.json({ success: true, observationId: observation.id, provider: response.provider || provider.name, model: response.model || aiRegistry.getActiveModel(), responsePersisted: true, response: response.content });
    }
    const agentId = body.agentId || "mirror-primary";
    const action = body.action || "cycle";
    if (action === "seed" || action === "perturb") {
      const description = String(body.description || "").trim();
      if (!description) return NextResponse.json({ error: "description is required" }, { status: 400 });
      const [observation] = await db.insert(behavioralObservations).values({
        agentId,
        observationType: action === "seed" ? "IDENTITY_TRAP" : "IDENTITY_PERTURBATION",
        description,
        metrics: JSON.stringify({ source: "CONTROLLED_RECURSION_TEST", persistent: true }),
      }).returning();
      return NextResponse.json({ success: true, observation });
    }
    if (["start", "resume", "pause", "cancel"].includes(action)) {
      const status = (action === "start" || action === "resume" ? "RUNNING" : action === "pause" ? "PAUSED" : "CANCELLED") as IdentityRunStatus;
      const run = await setIdentityRunStatus(status, agentId, {
        maxIterationsPerWorker: body.maxIterationsPerWorker,
        maxTokensPerCycle: body.maxTokensPerCycle,
        rateLimitMs: body.rateLimitMs,
        tokenBudget: body.tokenBudget,
      });
      const provider = aiRegistry.getActiveProvider();
      const model = aiRegistry.getActiveModel()
        || process.env.OPENROUTER_MODEL
        || process.env.GROQ_MODEL
        || process.env.LOCAL_MODEL
        || process.env.OLLAMA_DEFAULT_MODEL
        || null;
      if (!run.provider || !run.model) {
        const [lockedRun] = await db.update(recursiveIdentityRuns)
          .set({ provider: run.provider || provider.name, model: run.model || model, updatedAt: new Date() })
          .where(eq(recursiveIdentityRuns.id, run.id))
          .returning();
        return NextResponse.json({ success: true, run: lockedRun });
      }
      return NextResponse.json({ success: true, run });
    }
    if (action !== "cycle" && action !== "worker") {
      return NextResponse.json({ error: "Action must be start, resume, pause, cancel, cycle, or worker." }, { status: 400 });
    }
    const run = await getIdentityRun(agentId);
    const requested = action === "worker" ? Math.min(run.maxIterationsPerWorker, Math.max(1, Number(body.iterations || run.maxIterationsPerWorker))) : 1;
    const entries: Awaited<ReturnType<typeof runIdentityCycle>>[] = [];
    for (let index = 0; index < requested; index += 1) {
      entries.push(await runIdentityCycle(agentId));
    }
    return NextResponse.json({ success: true, entries, run: await getIdentityRun(agentId) });
  } catch (error) {
    return NextResponse.json({ error: "Identity recursion failed", details: error instanceof Error ? error.message : String(error) }, { status: 409 });
  }
}
