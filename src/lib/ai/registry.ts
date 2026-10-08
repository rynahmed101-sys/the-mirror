/** THE MIRROR — single provider registry.
 *
 * The scientific architecture remains useful with zero neural-model inference.
 */
import { DeterministicProvider } from "./deterministic";
import type { AIProvider, ModelInfo, ProviderHealth } from "./provider";

export type ProviderName = "model-independent";
interface ProviderRegistry {
  "model-independent": AIProvider;
}

let registry: ProviderRegistry | null = null;
const ACTIVE_MODEL = "deterministic-cognitive-substrate";

function buildRegistry(): ProviderRegistry {
  return { "model-independent": new DeterministicProvider() };
}

function getRegistry(): ProviderRegistry {
  if (!registry) registry = buildRegistry();
  return registry;
}

export function invalidateRegistry(): void {
  registry = null;
}

export function getProvider(name: ProviderName = "model-independent"): AIProvider {
  if (name !== "model-independent") {
    throw new Error("[THE MIRROR] Neural/cloud providers are disabled by architecture policy.");
  }
  return getRegistry()["model-independent"];
}

export function getActiveProviderName(): ProviderName {
  return "model-independent";
}

export function getActiveModel(): string {
  return ACTIVE_MODEL;
}

export function setActiveProvider(name: ProviderName, model?: string): void {
  if (name !== "model-independent") {
    throw new Error("[THE MIRROR] Neural/cloud providers are disabled by architecture policy.");
  }
  if (model && model !== ACTIVE_MODEL) {
    throw new Error("[THE MIRROR] Unknown model-independent model: " + model);
  }
}

export function setActiveModel(model: string): void {
  if (model !== ACTIVE_MODEL) {
    throw new Error("[THE MIRROR] Neural/cloud models are not enabled.");
  }
}

export interface ProviderStatus {
  name: "model-independent";
  isLocal: true;
  requiresApiKey: false;
  isActive: true;
  health: ProviderHealth;
}

export async function listProviders(): Promise<ProviderStatus[]> {
  const provider = getRegistry()["model-independent"];
  return [{
    name: "model-independent",
    isLocal: true,
    requiresApiKey: false,
    isActive: true,
    health: await provider.healthCheck(),
  }];
}

export async function listAllModels(): Promise<ModelInfo[]> {
  return getRegistry()["model-independent"].listModels();
}

export const aiRegistry = {
  getProvider,
  getActiveProvider: () => getProvider("model-independent"),
  getActiveProviderName,
  getActiveModel,
  setActiveProvider: (name: string, model?: string) =>
    setActiveProvider(name as ProviderName, model),
  setActiveModel,
  invalidateRegistry,
  listProviders: (): string[] => ["model-independent"],
  listModels: async (providerId: string): Promise<string[]> =>
    providerId === "model-independent"
      ? (await getRegistry()["model-independent"].listModels()).map((m) => m.name || m.id)
      : [],
  healthCheck: async (providerId: string): Promise<boolean> =>
    providerId === "model-independent" &&
    (await getRegistry()["model-independent"].healthCheck()).isHealthy,
  healthCheckFull: async (providerId: string): Promise<ProviderHealth> =>
    providerId === "model-independent"
      ? getRegistry()["model-independent"].healthCheck()
      : { isHealthy: false, provider: providerId, error: "Provider not enabled" },
};
