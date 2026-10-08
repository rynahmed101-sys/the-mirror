/** Optional provider-neutral remote inference adapter.
 *
 * The endpoint is intentionally vendor-agnostic. No Ollama, Qwen, or vendor SDK
 * is embedded in Mirror's architecture. The remote service must implement the
 * small JSON contract documented below.
 */
import type {
  AIProvider,
  AIResponse,
  ChatMessage,
  CompletionOptions,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from "./provider";

const endpointFromEnv = () => (process.env.MIRROR_AI_ENDPOINT || "").trim();
const tokenFromEnv = () => (process.env.MIRROR_AI_TOKEN || "").trim();
const modelFromEnv = () => (process.env.MIRROR_AI_MODEL || "mirror-frontier").trim();

function authHeaders(): Record<string, string> {
  const token = tokenFromEnv();
  return token
    ? { authorization: "Bearer " + token, "content-type": "application/json" }
    : { "content-type": "application/json" };
}

function normalizeResponse(payload: any): AIResponse {
  const message = payload?.message || payload?.choices?.[0]?.message || payload;
  const content = typeof message?.content === "string" ? message.content : "";
  const toolCalls = Array.isArray(message?.toolCalls)
    ? message.toolCalls
    : Array.isArray(message?.tool_calls)
      ? message.tool_calls.map((call: any) => ({
          id: String(call.id || "remote_tool"),
          name: String(call.name || call.function?.name || ""),
          arguments: typeof call.arguments === "object" && call.arguments !== null
            ? call.arguments
            : (() => {
                try { return JSON.parse(String(call.function?.arguments || "{}")); } catch { return {}; }
              })(),
        }))
      : undefined;
  return {
    content,
    toolCalls,
    inputTokens: Number(payload?.inputTokens ?? payload?.usage?.prompt_tokens ?? 0),
    outputTokens: Number(payload?.outputTokens ?? payload?.usage?.completion_tokens ?? 0),
    model: String(payload?.model || modelFromEnv()),
    provider: "remote-http",
    finishReason: payload?.finishReason || payload?.finish_reason,
    latencyMs: Number(payload?.latencyMs || 0) || undefined,
  };
}

export class RemoteHttpProvider implements AIProvider {
  readonly name = "remote-http";
  readonly isLocal = false;

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<AIResponse> {
    const endpoint = endpointFromEnv();
    if (!endpoint) throw new Error("MIRROR_AI_ENDPOINT is not configured");
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          schema_version: "mirror.ai_completion.v1",
          model: modelFromEnv(),
          messages,
          options,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Mirror remote AI returned HTTP " + response.status);
      const payload = await response.json();
      const normalized = normalizeResponse(payload);
      if (!normalized.content && !normalized.toolCalls?.length) {
        throw new Error("Mirror remote AI returned neither content nor tool calls");
      }
      return { ...normalized, latencyMs: normalized.latencyMs ?? Date.now() - started };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Mirror remote AI request timed out after 120000ms");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncGenerator<StreamChunk> {
    const response = await this.complete(messages, { ...options, stream: false });
    if (response.content) yield { type: "text", content: response.content };
    for (const toolCall of response.toolCalls || []) yield { type: "tool_call", toolCall };
    yield { type: "done" };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{
      id: modelFromEnv(),
      name: modelFromEnv(),
      provider: this.name,
      description: "Vendor-neutral remote inference endpoint configured by deployment policy.",
      isLocal: false,
    }];
  }

  async healthCheck(): Promise<ProviderHealth> {
    const endpoint = endpointFromEnv();
    if (!endpoint) return { isHealthy: false, provider: this.name, error: "MIRROR_AI_ENDPOINT is not configured" };
    return {
      isHealthy: true,
      provider: this.name,
      details: {
        configured: true,
        endpointHost: (() => {
          try { return new URL(endpoint).host; } catch { return "invalid-url"; }
        })(),
        model: modelFromEnv(),
      },
    };
  }

  requiresApiKey(): boolean {
    return tokenFromEnv().length > 0;
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const endpoint = endpointFromEnv();
    if (!endpoint) return { valid: false, errors: ["MIRROR_AI_ENDPOINT is not configured"] };
    try { new URL(endpoint); } catch { return { valid: false, errors: ["MIRROR_AI_ENDPOINT is not a valid URL"] }; }
    return { valid: true, errors: [] };
  }
}
