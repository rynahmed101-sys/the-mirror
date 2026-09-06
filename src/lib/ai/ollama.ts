/**
 * THE MIRROR — Ollama Provider
 *
 * Implements AIProvider for Ollama local model runtime.
 * No API key required. Models run entirely on local hardware.
 *
 * Prerequisites:
 *   1. Install Ollama: https://ollama.ai
 *   2. Pull a model: ollama pull llama3.2
 *   3. Ollama runs automatically on http://localhost:11434
 */

import type {
  AIProvider,
  AIResponse,
  ChatMessage,
  CompletionOptions,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
  ToolCall,
} from "./provider";
import { AIProvider as AIProviderBase } from "./provider";

export class OllamaProvider extends AIProviderBase {
  readonly name = "ollama";
  readonly isLocal = true;

  private baseUrl: string;
  private defaultModel: string;

  constructor(
    baseUrl = "http://localhost:11434",
    defaultModel = "llama3.2"
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
    if (!this.baseUrl) errors.push("OLLAMA_BASE_URL is not set");
    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const latencyMs = Date.now() - start;
      return {
        isHealthy: true,
        provider: this.name,
        latencyMs,
        details: { baseUrl: this.baseUrl },
      };
    } catch (err) {
      return {
        isHealthy: false,
        provider: this.name,
        error: err instanceof Error ? err.message : "Unknown error",
        details: {
          baseUrl: this.baseUrl,
          hint: "Make sure Ollama is running: ollama serve",
        },
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { models: OllamaModel[] };
      return (data.models || []).map((m) => ({
        id: m.name,
        name: m.name,
        provider: "ollama",
        isLocal: true,
        size: formatBytes(m.size),
        description: m.details?.family
          ? `${m.details.family} • ${m.details.parameter_size || ""}`
          : undefined,
        contextLength: undefined,
        tags: [m.details?.family, m.details?.quantization_level].filter(
          Boolean
        ) as string[],
      }));
    } catch {
      return [];
    }
  }

  async complete(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): Promise<AIResponse> {
    const model = this.defaultModel;
    const ollamaMessages = messages.map(toOllamaMessage);

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens,
      },
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: HTTP ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OllamaResponse;

    const toolCalls: ToolCall[] = (
      data.message?.tool_calls || []
    ).map((tc, i) => ({
      id: `tc_${i}`,
      name: tc.function.name,
      arguments: tc.function.arguments || {},
    }));

    return {
      content: data.message?.content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
      model,
      provider: "ollama",
      finishReason: data.done_reason,
    };
  }

  async *stream(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const model = this.defaultModel;
    const ollamaMessages = messages.map(toOllamaMessage);

    const body: Record<string, unknown> = {
      model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens,
      },
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok || !res.body) {
      yield {
        type: "error",
        error: `Ollama error: HTTP ${res.status}`,
      };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;

            if (chunk.message?.content) {
              yield { type: "text", content: chunk.message.content };
            }

            if (chunk.message?.tool_calls) {
              for (const tc of chunk.message.tool_calls) {
                yield {
                  type: "tool_call",
                  toolCall: {
                    id: `tc_${Date.now()}`,
                    name: tc.function.name,
                    arguments: tc.function.arguments || {},
                  },
                };
              }
            }

            if (chunk.done) {
              yield { type: "done" };
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

// ============================================================
// Ollama API Types
// ============================================================

interface OllamaModel {
  name: string;
  size: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaResponse {
  model: string;
  message?: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamChunk {
  model: string;
  message?: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
  done: boolean;
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

function toOllamaMessage(msg: ChatMessage): Record<string, unknown> {
  return {
    role: msg.role,
    content: msg.content,
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
