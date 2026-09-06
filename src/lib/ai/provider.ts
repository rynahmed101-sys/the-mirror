/**
 * THE MIRROR — AI Provider Abstraction Layer
 *
 * This interface defines the contract that all AI providers must implement.
 * The model layer is completely replaceable — THE MIRROR environment
 * operates independently of any specific AI provider.
 *
 * Provider hierarchy:
 *   AIProvider
 *   ├── OllamaProvider       (Phase 1 - primary local)
 *   ├── LlamaCppProvider     (Phase 1 - secondary local)
 *   ├── OpenAIProvider       (Phase 2 - future)
 *   ├── AnthropicProvider    (Phase 2 - future)
 *   └── GeminiProvider       (Phase 2 - future)
 */

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextLength?: number;
  isLocal: boolean;
  size?: string;
  tags?: string[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  systemPrompt?: string;
  stream?: boolean;
}

export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  inputTokens?: number;
  outputTokens?: number;
  model: string;
  provider: string;
  finishReason?: string;
}

export interface StreamChunk {
  type: "text" | "tool_call" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface ProviderHealth {
  isHealthy: boolean;
  provider: string;
  latencyMs?: number;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Core AI Provider Interface
 * All providers must implement this contract.
 */
export abstract class AIProvider {
  abstract readonly name: string;
  abstract readonly isLocal: boolean;

  abstract complete(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): Promise<AIResponse>;

  abstract stream(
    messages: ChatMessage[],
    options?: CompletionOptions
  ): AsyncGenerator<StreamChunk>;

  abstract listModels(): Promise<ModelInfo[]>;

  abstract healthCheck(): Promise<ProviderHealth>;

  /** Whether this provider requires an API key */
  abstract requiresApiKey(): boolean;

  /** Provider-specific configuration validation */
  abstract validateConfig(): { valid: boolean; errors: string[] };
}
