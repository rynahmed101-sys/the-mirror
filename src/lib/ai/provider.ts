/**
 * THE MIRROR — AI Provider Abstraction Layer
 *
 * The intelligence runtime is replaceable; THE MIRROR environment is not.
 * The built-in provider is Ollama, usable in either local or hosted-cloud mode.
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
  toolCallId?: string;
  toolName?: string;
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
  latencyMs?: number;
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

  abstract requiresApiKey(): boolean;

  abstract validateConfig(): { valid: boolean; errors: string[] };
}
