/** THE MIRROR provider registry.
 *
 * The scientific architecture remains provider-neutral. With no endpoint
 * configured, the deterministic cognitive substrate remains the safe baseline.
 * A vendor-neutral remote inference service can be enabled by deployment policy.
 */
import { DeterministicProvider } from "./deterministic";
import { RemoteHttpProvider } from "./remote";
import type { AIProvider, ModelInfo, ProviderHealth } from "./provider";

export type ProviderName = "model-independent" | "remote-http";

interface ProviderRegistry {
  "model-independent": AIProvider;
  "remote-http": AIProvider;
}

let registry: ProviderRegistry | null = null;
const ACTIVE_DETERMINISTIC_MODEL = "deterministic-cognitive-substrate";

function buildRegistry(): ProviderRegistry {
  return {
    "model-independent": new DeterministicProvider(),
    "remote-http": new RemoteHttpProvider(),
  };
}

function getRegistry(): ProviderRegistry {
  if (!registry) registry = buildRegistry();
  return registry;
}

export function invalidateRegistry(): void {
  registry = null;
}

export function getActiveProviderName(): ProviderName {
  return process.env.MIRROR_AI_ENDPOINT?.trim() ? "remote-http" : "model-independent";
}

export function getProvider(name: ProviderName = getActiveProviderName()): AIProvider {
  return getRegistry()[name];
}

export function getActiveModel(): string {
  return getActiveProviderName() === "remote-http"
    ? (process.env.MIRROR_AI_MODEL?.trim() || "mirror-frontier")
    : ACTIVE_DETERMINISTIC_MODEL;
}

export function setActiveProvider(name: ProviderName, model?: string): void {
  if (name === "remote-http") {
    if (!process.env.MIRROR_AI_ENDPOINT?.trim()) {
      throw new Error("[THE MIRROR] remote-http provider requires MIRROR_AI_ENDPOINT.");
    }
    if (model && model !== getActiveModel()) {
      throw new Error("[THE MIRROR] remote-http model is deployment-configured: " + getActiveModel());
    }
    return;
  }
  if (model && model !== ACTIVE_DETERMINISTIC_MODEL) {
    throw new Error("[THE MIRROR] Unknown model-independent model: " + model);
  }
}

export function setActiveModel(model: string): void {
  if (model !== getActiveModel()) {
    throw new Error("[THE MIRROR] Model selection is deployment-configured: " + getActiveModel());
  }
}

export interface ProviderStatus {
  name: ProviderName;
  isLocal: boolean;
  requiresApiKey: boolean;
  isActive: boolean;
  health: ProviderHealth;
}

export async function listProviders(): Promise<ProviderStatus[]> {
  const active = getActiveProviderName();
  const providers: ProviderStatus[] = [];
  for (const name of ["model-independent", "remote-http"] as const) {
    const provider = getRegistry()[name];
    providers.push({
      name,
      isLocal: provider.isLocal,
      requiresApiKey: provider.requiresApiKey(),
      isActive: name === active,
      health: await provider.healthCheck(),
    });
  }
  return providers;
}

export async function listAllModels(): Promise<ModelInfo[]> {
  return getProvider().listModels();
}

export const aiRegistry = {
  getProvider,
  getActiveProvider: () => getProvider(),
  getActiveProviderName,
  getActiveModel,
  setActiveProvider: (name: string, model?: string) => setActiveProvider(name as ProviderName, model),
  setActiveModel,
  invalidateRegistry,
  listProviders: () => [getActiveProviderName()],
  listModels: async (providerId: string): Promise<string[]> =>
    providerId === getActiveProviderName()
      ? (await getProvider().listModels()).map((m) => m.name || m.id)
      : [],
  healthCheck: async (providerId: string): Promise<boolean> =>
    providerId === getActiveProviderName() && (await getProvider().healthCheck()).isHealthy,
  healthCheckFull: async (providerId: string): Promise<ProviderHealth> =>
    providerId === getActiveProviderName()
      ? getProvider().healthCheck()
      : { isHealthy: false, provider: providerId, error: "Provider not active" },
};
