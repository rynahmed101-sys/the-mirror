/** Model-independent Mirror provider.
 *
 * This adapter intentionally uses no network, API key, hosted inference, or
 * local model runtime. It supplies deterministic routing over the existing
 * Mirror tool surface so the application remains useful with zero neural
 * inference.
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

const MODEL_ID = "deterministic-cognitive-substrate";

function latestUser(messages: ChatMessage[]): string {
  return [...messages].reverse().find((m) => m.role === "user")?.content?.trim() || "";
}

function resultSummary(messages: ChatMessage[]): string | null {
  const latest = [...messages].reverse().find((m) => m.role === "tool");
  if (!latest) return null;
  const raw = latest.content || "";
  return raw.length > 12_000 ? raw.slice(0, 12_000) + "
[tool output truncated by bound]" : raw;
}

function chooseTool(query: string): ToolCall | null {
  const q = query.toLowerCase();

  if (/(self[- ]model|what do you know about yourself|your claims)/.test(q)) {
    return { id: "det_tool_1", name: "get_self_model", arguments: {} };
  }
  if (/(experiment|experiments|hypothesis|lab result|research result)/.test(q)) {
    return { id: "det_tool_1", name: "read_experiments", arguments: { limit: 20 } };
  }
  if (/(timeline|recent events|history|what happened)/.test(q)) {
    return { id: "det_tool_1", name: "read_timeline", arguments: { limit: 20 } };
  }
  if (/(research|paper|literature|citation|arxiv|source)/.test(q)) {
    return { id: "det_tool_1", name: "research_world", arguments: { query: query.slice(0, 1000), limit: 5 } };
  }
  if (/(time|date|clock|today)/.test(q)) {
    return { id: "det_tool_1", name: "get_time", arguments: {} };
  }
  return null;
}

function explain(): string {
  return [
    "Mirror is running in model-independent mode.",
    "No Ollama runtime, hosted inference service, API key, or model download is required.",
    "The persistent cognitive substrate and bounded tool system remain available.",
    "Stored evidence, experiments, timeline, research, and time can be queried deterministically.",
    "A future reasoning model can be attached without changing the brain, memory, evidence, or authority boundaries.",
  ].join(" ");
}

export class DeterministicProvider extends AIProviderBase {
  readonly name = "model-independent";
  readonly isLocal = true;

  async complete(messages: ChatMessage[], _options: CompletionOptions = {}): Promise<AIResponse> {
    const toolResult = resultSummary(messages);
    if (toolResult !== null) {
      return {
        content: toolResult,
        model: MODEL_ID,
        provider: this.name,
        finishReason: "tool_result_summarized",
      };
    }

    const query = latestUser(messages);
    const toolCall = chooseTool(query);
    return {
      content: toolCall
        ? "Deterministically selecting one bounded Mirror tool based on the requested evidence domain."
        : explain(),
      toolCalls: toolCall ? [toolCall] : undefined,
      model: MODEL_ID,
      provider: this.name,
      finishReason: toolCall ? "tool_call" : "complete",
    };
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncGenerator<StreamChunk> {
    const response = await this.complete(messages, options);
    if (response.content) yield { type: "text", content: response.content };
    for (const toolCall of response.toolCalls || []) yield { type: "tool_call", toolCall };
    yield { type: "done" };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{
      id: MODEL_ID,
      name: MODEL_ID,
      provider: this.name,
      description: "Deterministic cognitive substrate; no neural inference.",
      isLocal: true,
    }];
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      isHealthy: true,
      provider: this.name,
      details: { mode: "model-independent", networkInference: false },
    };
  }

  requiresApiKey(): boolean {
    return false;
  }

  validateConfig(): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }
}
