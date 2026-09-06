/**
 * THE MIRROR — AI Provider Registry
 *
 * Central registry for all AI providers.
 * The active provider is selected via environment variables or database config.
 * Switching providers does not require code changes.
 */

import { OllamaProvider } from "./ollama";
import { LlamaCppProvider } from "./llamacpp";
import type { AIProvider, ModelInfo, ProviderHealth } from "./provider";

export type ProviderName = "ollama" | "llamacpp" | "openai" | "anthropic" | "gemini";

interface ProviderRegistry {
  [key: string]: AIProvider;
}

// Singleton registry
let registry: ProviderRegistry | null = null;
let activeProviderName: ProviderName = "ollama";
let activeModel: string | null = null;

function buildRegistry(): ProviderRegistry {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  const ollamaModel = process.env.OLLAMA_DEFAULT_MODEL || "llama3.2";
  const llamaUrl = process.env.LLAMACPP_BASE_URL || "http://localhost:8080";

  return {
    ollama: new OllamaProvider(ollamaUrl, ollamaModel),
    llamacpp: new LlamaCppProvider(llamaUrl),
    // Phase 2 — will be registered when API keys are present
    // openai: new OpenAIProvider(process.env.OPENAI_API_KEY),
    // anthropic: new AnthropicProvider(process.env.ANTHROPIC_API_KEY),
    // gemini: new GeminiProvider(process.env.GEMINI_API_KEY),
  };
}

function getRegistry(): ProviderRegistry {
  if (!registry) {
    registry = buildRegistry();
  }
  return registry;
}

/**
 * Get the currently active AI provider instance.
 */
export function getProvider(name?: ProviderName): AIProvider {
  const reg = getRegistry();
  const providerName = name || activeProviderName;
  const provider = reg[providerName];
  if (!provider) {
    throw new Error(
      `AI provider "${providerName}" is not registered. Available: ${Object.keys(reg).join(", ")}`
    );
  }
  return provider;
}

/**
 * Get the currently active AI provider name.
 */
export function getActiveProviderName(): ProviderName {
  return activeProviderName;
}

/**
 * Get the currently selected model name (overrides provider default).
 */
export function getActiveModel(): string | null {
  return activeModel;
}

/**
 * Set the active provider and optionally the model.
 * This affects all subsequent AI calls.
 */
export function setActiveProvider(name: ProviderName, model?: string): void {
  const reg = getRegistry();
  if (!reg[name]) {
    throw new Error(`Provider "${name}" is not available`);
  }
  activeProviderName = name;
  if (model) activeModel = model;
}

/**
 * Set the active model for the current provider.
 */
export function setActiveModel(model: string): void {
  activeModel = model;
}

/**
 * List all registered providers and their status.
 */
export async function listProviders(): Promise<ProviderStatus[]> {
  const reg = getRegistry();
  const statuses = await Promise.allSettled(
    Object.entries(reg).map(async ([name, provider]) => {
      const health = await provider.healthCheck().catch((e) => ({
        isHealthy: false,
        provider: name,
        error: e.message,
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
      health: { isHealthy: false, provider: "unknown", error: "Failed to check" } as ProviderHealth,
    }
  );
}

/**
 * List all available models across all providers.
 */
export async function listAllModels(): Promise<ModelInfo[]> {
  const reg = getRegistry();
  const results = await Promise.allSettled(
    Object.values(reg).map((p) => p.listModels())
  );

  return results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );
}

export interface ProviderStatus {
  name: ProviderName;
  isLocal: boolean;
  requiresApiKey: boolean;
  isActive: boolean;
  health: ProviderHealth;
}

// Initialize from environment on module load
if (process.env.AI_PROVIDER) {
  const envProvider = process.env.AI_PROVIDER as ProviderName;
  activeProviderName = envProvider;
}
if (process.env.OLLAMA_DEFAULT_MODEL) {
  activeModel = process.env.OLLAMA_DEFAULT_MODEL;
}
