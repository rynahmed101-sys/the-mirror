/** THE MIRROR — Ollama-only AI registry.
 *
 * Supports two deployments without two codebases:
 *   OLLAMA_MODE=local  -> localhost Ollama, no key
 *   OLLAMA_MODE=cloud  -> Ollama Cloud, Bearer key
 */

import { OllamaProvider } from "./ollama";
import type { AIProvider, ModelInfo, ProviderHealth } from "./provider";

export type ProviderName = "ollama";
interface ProviderRegistry { ollama: AIProvider; }

let registry: ProviderRegistry | null = null;
let activeModel: string | null = null;

function buildRegistry(): ProviderRegistry {
  return {
    ollama: new OllamaProvider(),
  };
}

function getRegistry(): ProviderRegistry {
  if (!registry) registry = buildRegistry();
  return registry;
}

export function invalidateRegistry(): void {
  registry = null;
  activeModel = null;
}

export function getProvider(name: ProviderName = "ollama"): AIProvider {
  if (name !== "ollama") {
    throw new Error("[THE MIRROR] Only Ollama is supported.");
  }
  return getRegistry().ollama;
}

export function getActiveProviderName(): ProviderName {
  return "ollama";
}

export function getActiveModel(): string | null {
  if (activeModel) return activeModel;
  const configured = process.env.OLLAMA_DEFAULT_MODEL;
  if (configured) return configured;
  const mode = (process.env.OLLAMA_MODE || "").toLowerCase();
  const hosted = mode === "cloud" || mode === "online" || mode === "remote" || Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
  return hosted ? "gpt-oss:20b-cloud" : "llama3.2";
}

export function setActiveProvider(name: ProviderName, model?: string): void {
  if (name !== "ollama") {
    throw new Error("[THE MIRROR] Only Ollama is supported.");
  }
  if (model) activeModel = model;
}

export function setActiveModel(model: string): void {
  activeModel = model;
}

export interface ProviderStatus {
  name: "ollama";
  isLocal: boolean;
  requiresApiKey: boolean;
  isActive: true;
  health: ProviderHealth;
}

export async function listProviders(): Promise<ProviderStatus[]> {
  const provider = getRegistry().ollama;
  return [{
    name: "ollama",
    isLocal: provider.isLocal,
    requiresApiKey: provider.requiresApiKey(),
    isActive: true,
    health: await provider.healthCheck(),
  }];
}

export async function listAllModels(): Promise<ModelInfo[]> {
  return getRegistry().ollama.listModels();
}

export const aiRegistry = {
  getProvider,
  getActiveProvider: () => getProvider("ollama"),
  getActiveProviderName,
  getActiveModel,
  setActiveProvider: (name: string, model?: string) =>
    setActiveProvider(name as ProviderName, model),
  setActiveModel,
  invalidateRegistry,
  listProviders: (): string[] => ["ollama"],
  listModels: async (providerId: string): Promise<string[]> => {
    if (providerId !== "ollama") return [];
    return (await getRegistry().ollama.listModels()).map((m) => m.name || m.id);
  },
  healthCheck: async (providerId: string): Promise<boolean> =>
    providerId === "ollama" &&
    (await getRegistry().ollama.healthCheck()).isHealthy,
  healthCheckFull: async (providerId: string): Promise<ProviderHealth> =>
    providerId === "ollama"
      ? getRegistry().ollama.healthCheck()
      : {
          isHealthy: false,
          provider: providerId,
          error: "Only Ollama is supported",
        },
};
