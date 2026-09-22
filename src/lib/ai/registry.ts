/** THE MIRROR — Ollama-only AI registry. No paid/cloud AI providers. */
import { OllamaProvider } from "./ollama";
import type { AIProvider, ModelInfo, ProviderHealth } from "./provider";

export type ProviderName = "ollama";
interface ProviderRegistry { ollama: AIProvider; }

let registry: ProviderRegistry | null = null;
let activeModel: string | null = null;

function buildRegistry(): ProviderRegistry {
  return {
    ollama: new OllamaProvider(
      process.env.OLLAMA_BASE_URL || "http://localhost:11434",
      process.env.OLLAMA_DEFAULT_MODEL || "llama3.2:latest"
    ),
  };
}
function getRegistry(): ProviderRegistry {
  if (!registry) registry = buildRegistry();
  return registry;
}
export function invalidateRegistry(): void { registry = null; }
export function getProvider(name: ProviderName = "ollama"): AIProvider {
  const provider = getRegistry().ollama;
  if (name !== "ollama") throw new Error("[THE MIRROR] Only Ollama is supported.");
  return provider;
}
export function getActiveProviderName(): ProviderName { return "ollama"; }
export function getActiveModel(): string | null {
  return activeModel || process.env.OLLAMA_DEFAULT_MODEL || "llama3.2:latest";
}
export function setActiveProvider(name: ProviderName, model?: string): void {
  if (name !== "ollama") throw new Error("[THE MIRROR] Only Ollama is supported.");
  if (model) activeModel = model;
}
export function setActiveModel(model: string): void { activeModel = model; }

export interface ProviderStatus {
  name: "ollama";
  isLocal: true;
  requiresApiKey: false;
  isActive: true;
  health: ProviderHealth;
}
export async function listProviders(): Promise<ProviderStatus[]> {
  const provider = getRegistry().ollama;
  const health = await provider.healthCheck();
  return [{ name: "ollama", isLocal: true, requiresApiKey: false, isActive: true, health }];
}
export async function listAllModels(): Promise<ModelInfo[]> {
  return getRegistry().ollama.listModels();
}

export const aiRegistry = {
  getProvider,
  getActiveProvider: () => getProvider("ollama"),
  getActiveProviderName,
  getActiveModel,
  setActiveProvider: (name: string, model?: string) => setActiveProvider(name as ProviderName, model),
  setActiveModel,
  invalidateRegistry,
  listProviders: (): string[] => ["ollama"],
  listModels: async (providerId: string): Promise<string[]> => {
    if (providerId !== "ollama") return [];
    return (await getRegistry().ollama.listModels()).map((m) => m.name || m.id);
  },
  healthCheck: async (providerId: string): Promise<boolean> =>
    providerId === "ollama" && (await getRegistry().ollama.healthCheck()).isHealthy,
  healthCheckFull: async (providerId: string): Promise<ProviderHealth> =>
    providerId === "ollama"
      ? getRegistry().ollama.healthCheck()
      : { isHealthy: false, provider: providerId, error: "Only Ollama is supported" },
};
