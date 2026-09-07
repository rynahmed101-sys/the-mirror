/**
 * THE MIRROR — AI Provider Registry
 *
 * Central registry for all AI providers.
 * Provider selection is EXPLICIT and env-driven.
 * No silent fallback between providers is permitted.
 *
 * Supported providers:
 *   ollama      — Local Ollama runtime
 *   llamacpp    — Local llama.cpp runtime
 *   openrouter  — OpenRouter (Meta Llama and others via aggregation API)
 *   xai         — xAI / Grok
 */

import { OllamaProvider } from "./ollama";
import { LlamaCppProvider } from "./llamacpp";
import { OpenRouterProvider } from "./openrouter";
import { XAIProvider } from "./xai";
import type { AIProvider, ModelInfo, ProviderHealth } from "./provider";

export type ProviderName = "ollama" | "llamacpp" | "openrouter" | "xai" | "openai" | "anthropic" | "gemini";

interface ProviderRegistry {
  [key: string]: AIProvider;
}

// Singleton registry (reset on env change via invalidateRegistry())
let registry: ProviderRegistry | null = null;
let activeProviderName: ProviderName = "ollama";
let activeModel: string | null = null;

function buildRegistry(): ProviderRegistry {
  const ollamaUrl   = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const ollamaModel = process.env.OLLAMA_DEFAULT_MODEL || "llama3.2";
  const llamaUrl    = process.env.LLAMACPP_BASE_URL || "http://localhost:8080";

  return {
    ollama:      new OllamaProvider(ollamaUrl, ollamaModel),
    llamacpp:    new LlamaCppProvider(llamaUrl),
    openrouter:  new OpenRouterProvider(),
    xai:         new XAIProvider(),
  };
}

function getRegistry(): ProviderRegistry {
  if (!registry) registry = buildRegistry();
  return registry;
}

/** Force re-instantiation of all providers (useful after env changes in tests). */
export function invalidateRegistry(): void {
  registry = null;
}

/**
 * Get the currently active AI provider instance.
 *
 * IMPORTANT: This function NEVER falls back silently.
 * If the configured provider is not registered, it throws immediately.
 * This guarantees that an experiment configured for "openrouter" will never
 * accidentally run on "xai" or "ollama".
 */
export function getProvider(name?: ProviderName): AIProvider {
  const reg = getRegistry();
  const providerName = name || activeProviderName;
  const provider = reg[providerName];
  if (!provider) {
    throw new Error(
      `[THE MIRROR] AI provider "${providerName}" is not registered. ` +
      `Available providers: ${Object.keys(reg).join(", ")}. ` +
      `Set AI_PROVIDER to one of the available providers.`
    );
  }
  return provider;
}

/** Get the name of the currently active provider. */
export function getActiveProviderName(): ProviderName {
  return activeProviderName;
}

/** Get the currently selected model override (or null if using provider default). */
export function getActiveModel(): string | null {
  return activeModel;
}

/**
 * Explicitly switch the active provider.
 * Throws if the provider is not registered — no silent fallback.
 */
export function setActiveProvider(name: ProviderName, model?: string): void {
  const reg = getRegistry();
  if (!reg[name]) {
    throw new Error(`[THE MIRROR] Provider "${name}" is not registered. Cannot switch.`);
  }
  activeProviderName = name;
  if (model) activeModel = model;
}

export function setActiveModel(model: string): void {
  activeModel = model;
}

export async function listProviders(): Promise<ProviderStatus[]> {
  const reg = getRegistry();
  const statuses = await Promise.allSettled(
    Object.entries(reg).map(async ([name, provider]) => {
      const health = await provider.healthCheck().catch((e) => ({
        isHealthy: false,
        provider: name,
        error: e instanceof Error ? e.message : String(e),
      }));
      return {
        name: name as ProviderName,
        isLocal: provider.isLocal,
        requiresApiKey: provider.requiresApiKey(),
        isActive: name === activeProviderName,
        health,
      };
    })
  );

  return statuses.map((s) =>
    s.status === "fulfilled" ? s.value : {
      name: "unknown" as ProviderName,
      isLocal: false,
      requiresApiKey: false,
      isActive: false,
      health: { isHealthy: false, provider: "unknown", error: "Status check failed" } as ProviderHealth,
    }
  );
}

export async function listAllModels(): Promise<ModelInfo[]> {
  const reg = getRegistry();
  const results = await Promise.allSettled(Object.values(reg).map((p) => p.listModels()));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

export interface ProviderStatus {
  name: ProviderName;
  isLocal: boolean;
  requiresApiKey: boolean;
  isActive: boolean;
  health: ProviderHealth;
}

// ─── Initialise from environment on module load ───────────────────────────────
// AI_PROVIDER is the single source of truth for which provider is active.
// No auto-detection, no silent substitution.
if (process.env.AI_PROVIDER) {
  activeProviderName = process.env.AI_PROVIDER as ProviderName;
}

// aiRegistry — exported singleton facade used throughout the codebase
export const aiRegistry = {
  getProvider,
  getActiveProvider: () => getProvider(),
  getActiveProviderName,
  getActiveModel,
  setActiveProvider: (name: string, model?: string) => setActiveProvider(name as ProviderName, model),
  setActiveModel,
  invalidateRegistry,
  listProviders: (): string[] => Object.keys(getRegistry()),
  listModels: async (providerId: string): Promise<string[]> => {
    try {
      const p = getProvider(providerId as ProviderName);
      const models = await p.listModels();
      return models.map((m) => m.name || m.id);
    } catch {
      return [];
    }
  },
  healthCheck: async (providerId: string): Promise<boolean> => {
    try {
      const p = getProvider(providerId as ProviderName);
      const h = await p.healthCheck();
      return h.isHealthy;
    } catch {
      return false;
    }
  },
  /** Returns full health detail for a provider (not just boolean). */
  healthCheckFull: async (providerId: string): Promise<ProviderHealth> => {
    try {
      const p = getProvider(providerId as ProviderName);
      return await p.healthCheck();
    } catch (err) {
      return { isHealthy: false, provider: providerId, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
