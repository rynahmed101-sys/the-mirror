/**
 * THE MIRROR — llama.cpp Provider (Phase 1 scaffold)
 *
 * Implements AIProvider for llama.cpp server.
 * llama.cpp exposes an OpenAI-compatible API at /v1/chat/completions
 * when run with: ./server -m model.gguf --port 8080
 *
 * This is a scaffold — fully functional but less tested than OllamaProvider.
 */

import type {
  AIResponse,
  ChatMessage,
  CompletionOptions,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from "./provider";
import { AIProvider } from "./provider";

export class LlamaCppProvider extends AIProvider {
  readonly name = "llamacpp";
  readonly isLocal = true;

  private baseUrl: string;
  private defaultModel: string;

  constructor(
    baseUrl = "http://localhost:8080",
    defaultModel = "local-model"
  ) {
    super();
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  requiresApiKey(): boolean {
    return false;
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.baseUrl) errors.push("LLAMACPP_BASE_URL is not set");
    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return {
        isHealthy: true,
        provider: this.name,
        latencyMs: Date.now() - start,
        details: { baseUrl: this.baseUrl },
      };
    } catch (err) {
      return {
        isHealthy: false,
        provider: this.name,
        error: err instanceof Error ? err.message : "Unknown error",
        details: {
          baseUrl: this.baseUrl,
          hint: "Start llama.cpp server: ./server -m model.gguf --port 8080",
        },
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    // llama.cpp doesn't expose a model list — return the configured default
    return [
      {
        id: this.defaultModel,
        name: this.defaultModel,
        provider: "llamacpp",
        isLocal: true,
        description: "Local llama.cpp model",
      },
    ];
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<AIResponse> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      throw new Error(`llama.cpp error: HTTP ${res.status}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message: { content: string };
        finish_reason: string;
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message?.content || "",
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      model: this.defaultModel,
      provider: "llamacpp",
      finishReason: data.choices[0]?.finish_reason,
    };
  }

  async *stream(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.defaultModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok || !res.body) {
      yield { type: "error", error: `llama.cpp error: HTTP ${res.status}` };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            yield { type: "done" };
            continue;
          }
          try {
            const chunk = JSON.parse(data) as {
              choices: Array<{ delta: { content?: string } }>;
            };
            const content = chunk.choices[0]?.delta?.content;
            if (content) yield { type: "text", content };
          } catch {
            // Skip malformed SSE
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
