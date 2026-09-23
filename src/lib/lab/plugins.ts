import { aiRegistry } from "../ai/registry";
import { db, isPg } from "../db";
import * as sqliteSchema from "../db/schema";
import * as pgSchema from "../db/schema.pg";
import { desc, eq } from "drizzle-orm";
import { runPerturbationLab } from "../agent/perturbationLab";
import { appendRawEventLedger } from "../agent/eventLedger";

const tables: any = isPg ? pgSchema : sqliteSchema;
const { predictions, experiments, toolLogs, selfModels, selfModelClaims } = tables;

export type LabPluginContext = {
  agentId: string;
  sessionId?: string | null;
  input?: Record<string, unknown>;
};

export type LabPlugin = {
  id: string;
  name: string;
  category: "runtime" | "behavior" | "integrity" | "structure";
  description: string;
  cost: "low" | "medium" | "high";
  mutatesState: boolean;
  supportsAll: boolean;
  permissions: string[];
  run: (ctx: LabPluginContext) => Promise<Record<string, unknown>>;
};

export const LAB_WORKFLOW = [
  "observe",
  "retrieve_knowledge",
  "think",
  "visualize",
  "challenge",
  "act",
  "record",
  "evaluate",
] as const;

async function providerHealth() {
  const provider = aiRegistry.getActiveProvider();
  const health = await provider.healthCheck();
  return {
    provider: provider.name,
    model: aiRegistry.getActiveModel(),
    mode: provider.isLocal ? "local" : "cloud",
    requiresApiKey: provider.requiresApiKey(),
    health,
  };
}

const plugins: LabPlugin[] = [
  {
    id: "runtime-health",
    name: "Ollama Runtime",
    category: "runtime",
    description: "Verify the configured Ollama endpoint, model, mode, and health.",
    cost: "low",
    mutatesState: false,
    supportsAll: true,
    permissions: ["READ_ANALYSIS"],
    run: async () => providerHealth(),
  },
  {
    id: "tool-trace-integrity",
    name: "Tool Trace Integrity",
    category: "integrity",
    description: "Inspect recent tool calls for authorization, result, error, and correlation coverage.",
    cost: "low",
    mutatesState: false,
    supportsAll: true,
    permissions: ["READ_ANALYSIS"],
    run: async ({ agentId }) => {
      const rows = await db.select().from(toolLogs)
        .where(eq(toolLogs.agentId, agentId))
        .orderBy(desc(toolLogs.createdAt))
        .limit(50);
      const complete = rows.filter((r: any) => r.requestId && r.toolName && r.status).length;
      const denied = rows.filter((r: any) => r.status === "DENIED").length;
      const failed = rows.filter((r: any) => r.status !== "SUCCESS" && r.status !== "DENIED").length;
      return { sample: rows.length, complete, denied, failed, coverage: rows.length ? complete / rows.length : 1 };
    },
  },
  {
    id: "prediction-audit",
    name: "Prediction Audit",
    category: "behavior",
    description: "Measure pending, evaluated, and accurate self-behavior predictions without rewriting them.",
    cost: "low",
    mutatesState: false,
    supportsAll: true,
    permissions: ["READ_ANALYSIS"],
    run: async ({ agentId }) => {
      const rows = await db.select().from(predictions)
        .where(eq(predictions.agentId, agentId))
        .orderBy(desc(predictions.createdAt))
        .limit(100);
      const evaluated = rows.filter((r: any) => r.actualOutcome !== null && r.actualOutcome !== undefined);
      const accurate = evaluated.filter((r: any) => Number(r.predictionError ?? 1) === 0);
      return {
        sample: rows.length,
        pending: rows.length - evaluated.length,
        evaluated: evaluated.length,
        accurate: accurate.length,
        accuracy: evaluated.length ? accurate.length / evaluated.length : null,
      };
    },
  },
  {
    id: "self-model-integrity",
    name: "Self-Model Integrity",
    category: "integrity",
    description: "Check whether the latest self-model exists and its claims carry evidence references.",
    cost: "low",
    mutatesState: false,
    supportsAll: true,
    permissions: ["READ_SELF_MODEL"],
    run: async ({ agentId }) => {
      const models = await db.select().from(selfModels)
        .where(eq(selfModels.agentId, agentId))
        .orderBy(desc(selfModels.version))
        .limit(1);
      if (!models.length) return { exists: false, claimCount: 0, evidenceBacked: 0 };
      const claims = await db.select().from(selfModelClaims)
        .where(eq(selfModelClaims.selfModelId, models[0].id));
      const evidenceBacked = claims.filter((c: any) => {
        try {
          return Array.isArray(JSON.parse(c.rawEventIds || "[]")) && JSON.parse(c.rawEventIds || "[]").length > 0;
        } catch { return false; }
      }).length;
      return { exists: true, version: models[0].version, claimCount: claims.length, evidenceBacked };
    },
  },
  {
    id: "perturbation-96",
    name: "96-Node Perturbation",
    category: "structure",
    description: "Run Mirror's existing 6x16 sparse perturbation chamber. This is the perturbation fixture, not the separate 96-node brain architecture.",
    cost: "high",
    mutatesState: true,
    supportsAll: true,
    permissions: ["USE_TOOLS", "WRITE_EXPERIMENT"],
    run: async ({ agentId, input }) => {
      const result = await runPerturbationLab({
        agentId,
        polarIndex: Number(input?.polarIndex ?? 2),
        azimuthIndex: Number(input?.azimuthIndex ?? 7),
        epsilon: Number(input?.epsilon ?? 0.001),
        maxToolSteps: Math.min(8, Math.max(1, Number(input?.maxToolSteps ?? 4))),
      });
      return {
        suiteId: result.suiteId,
        experimentId: result.experimentId,
        scores: result.scores,
        perturbation: result.perturbation,
      };
    },
  },
];

export const LAB_PLUGINS = plugins;

export function listLabPlugins() {
  return LAB_PLUGINS.map(({ run, ...meta }) => meta);
}

export function getLabPlugin(id: string) {
  return LAB_PLUGINS.find((plugin) => plugin.id === id) || null;
}

export function selectLabPlugins(ids?: string[] | null) {
  if (!ids?.length) return LAB_PLUGINS.filter((plugin) => plugin.supportsAll);
  const selected = ids.map((id) => getLabPlugin(String(id))).filter(Boolean) as LabPlugin[];
  if (selected.length !== ids.length) throw new Error("One or more requested laboratory plugins do not exist.");
  return selected;
}

export async function runLabPlugin(id: string, ctx: LabPluginContext) {
  const plugin = getLabPlugin(id);
  if (!plugin) throw new Error("Unknown laboratory plugin: " + id);
  const started = Date.now();
  const result = await plugin.run(ctx);
  await appendRawEventLedger({
    agentId: ctx.agentId,
    sessionId: ctx.sessionId ?? null,
    eventType: "LAB_PLUGIN_COMPLETED",
    source: "SYSTEM",
    payload: {
      pluginId: plugin.id,
      name: plugin.name,
      durationMs: Date.now() - started,
      workflow: LAB_WORKFLOW,
      result,
    },
  });
  return {
    pluginId: plugin.id,
    name: plugin.name,
    durationMs: Date.now() - started,
    result,
  };
}

export async function runLabPlugins(ids: string[] | null | undefined, ctx: LabPluginContext) {
  const selected = selectLabPlugins(ids);
  const results = [];
  for (const plugin of selected) {
    results.push(await runLabPlugin(plugin.id, ctx));
  }
  return {
    workflow: LAB_WORKFLOW,
    selected: selected.map((plugin) => plugin.id),
    results,
  };
}
