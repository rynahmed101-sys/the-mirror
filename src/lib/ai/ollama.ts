/**
 * THE MIRROR — Ollama Provider
 *
 * One adapter, two runtimes:
 *   local:  http://localhost:11434/api (no key)
 *   cloud:  https://ollama.com/api       (Bearer key)
 *
 * This keeps the local and online Mirror versions behaviorally identical.
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

export function resolveOllamaRuntimeConfig(env: Record<string, string | undefined> = process.env) {
  const requestedMode = (env.OLLAMA_MODE || "").toLowerCase();
  const cloudByDeployment = Boolean(env.VERCEL || env.VERCEL_ENV);
  const cloud = requestedMode === "cloud" || requestedMode === "online" || requestedMode === "remote" ||
    (!requestedMode && cloudByDeployment);

  return {
    cloud,
    baseUrl: (env.OLLAMA_BASE_URL || (cloud ? "https://ollama.com/api" : "http://localhost:11434/api")).replace(/\/$/, ""),
    defaultModel: env.OLLAMA_DEFAULT_MODEL || (cloud ? "gpt-oss:20b-cloud" : "llama3.2"),
  };
}

export class OllamaProvider extends AIProviderBase {
  readonly name = "ollama";
  readonly isLocal: boolean;

  private baseUrl: string;
  private defaultModel: string;
  private apiKey?: string;

  constructor(
    baseUrl = process.env.OLLAMA_BASE_URL,
    defaultModel = process.env.OLLAMA_DEFAULT_MODEL
  ) {
    super();

    const cfg = resolveOllamaRuntimeConfig({
      ...process.env,
      OLLAMA_BASE_URL: baseUrl,
      OLLAMA_DEFAULT_MODEL: defaultModel,
    });

    this.baseUrl = cfg.baseUrl;
    this.defaultModel = cfg.defaultModel;
    this.apiKey = process.env.OLLAMA_API_KEY;
    this.isLocal = !cfg.cloud && /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(this.baseUrl);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (!this.isLocal && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  requiresApiKey(): boolean {
    return !this.isLocal;
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.baseUrl) {
      errors.push("OLLAMA_BASE_URL is not set");
    }

    if (!this.isLocal && !this.apiKey) {
      errors.push("OLLAMA_API_KEY is required for hosted Ollama");
    }

    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();

    try {
      if (!this.isLocal && !this.apiKey) {
        return {
          isHealthy: false,
          provider: this.name,
          error: "OLLAMA_API_KEY is required for hosted Ollama",
          details: { baseUrl: this.baseUrl, mode: "cloud" },
        };
      }

      const res = await fetch(`${this.baseUrl}/tags`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      return {
        isHealthy: true,
        provider: this.name,
        latencyMs: Date.now() - start,
        details: {
          baseUrl: this.baseUrl,
          mode: this.isLocal ? "local" : "cloud",
          model: this.defaultModel,
        },
      };
    } catch (err) {
      return {
        isHealthy: false,
        provider: this.name,
        error: err instanceof Error ? err.message : "Unknown error",
        details: {
          baseUrl: this.baseUrl,
          mode: this.isLocal ? "local" : "cloud",
        },
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/tags`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return [];

      const data = (await res.json()) as { models?: OllamaModel[] };

      return (data.models || []).map((m) => ({
        id: m.name,
        name: m.name,
        provider: this.name,
        isLocal: this.isLocal,
        size: m.size ? formatBytes(m.size) : undefined,
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
    const startedAt = Date.now();
    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: messages.map(toOllamaMessage),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens,
      },
    };

    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });

    if (!res.ok) {
      throw new Error(`Ollama error: HTTP ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as OllamaResponse;

    const toolCalls: ToolCall[] = (data.message?.tool_calls || []).map(
      (tc, i) => ({
        id: `ollama_tc_${Date.now()}_${i}`,
        name: tc.function.name,
        arguments: tc.function.arguments || {},
      })
    );

    return {
      content: data.message?.content || "",
      toolCalls: toolCalls.length ? toolCalls : undefined,
      inputTokens: data.prompt_eval_count,
      outputTokens: data.eval_count,
      model: this.defaultModel,
      provider: this.name,
      finishReason: data.done_reason,
      latencyMs: Date.now() - startedAt,
    };
  }

  async *stream(
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: messages.map(toOllamaMessage),
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens,
      },
    };

    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: this.getHeaders(),
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
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines.filter(Boolean)) {
          try {
            const chunk = JSON.parse(line) as OllamaStreamChunk;

            if (chunk.message?.content) {
              yield { type: "text", content: chunk.message.content };
            }

            for (const tc of chunk.message?.tool_calls || []) {
              yield {
                type: "tool_call",
                toolCall: {
                  id: `ollama_tc_${Date.now()}`,
                  name: tc.function.name,
                  arguments: tc.function.arguments || {},
                },
              };
            }

            if (chunk.done) {
              yield { type: "done" };
            }
          } catch {
            // Ignore malformed stream frames.
          }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer) as OllamaStreamChunk;
          if (chunk.message?.content) {
            yield { type: "text", content: chunk.message.content };
          }
          for (const tc of chunk.message?.tool_calls || []) {
            yield {
              type: "tool_call",
              toolCall: {
                id: `ollama_tc_${Date.now()}`,
                name: tc.function.name,
                arguments: tc.function.arguments || {},
              },
            };
          }
          if (chunk.done) yield { type: "done" };
        } catch {
          // Ignore incomplete final frame.
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}

interface OllamaModel {
  name: string;
  size?: number;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
}

interface OllamaResponse {
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
    content?: string;
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
  const out: Record<string, unknown> = {
    role: msg.role,
    content: msg.content,
  };

  if (msg.toolCalls?.length) {
    out.tool_calls = msg.toolCalls.map((call) => ({
      function: {
        name: call.name,
        arguments: call.arguments,
      },
    }));
  }

  if (msg.toolName) {
    out.tool_name = msg.toolName;
  }

  return out;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  );
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}${units[i] === "B" ? "" : ""}`;
}
