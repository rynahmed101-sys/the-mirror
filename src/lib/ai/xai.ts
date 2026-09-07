/**
 * THE MIRROR - xAI / Grok Provider
 *
 * Calls xAI Grok via its OpenAI-compatible API at api.x.ai.
 * https://api.x.ai/v1/chat/completions
 *
 * Required env: XAI_API_KEY
 * Optional env: XAI_MODEL (default: grok-beta)
 *
 * Provider identity: xai / grok-beta (or configured model).
 * Never label as Llama or OpenRouter.
 *
 * SECURITY: API key never exposed in responses, logs or errors.
 */

import type {
  AIResponse,
  ChatMessage,
  CompletionOptions,
  ModelInfo,
  ProviderHealth,
  StreamChunk,
} from './provider';
import { AIProvider } from './provider';

const XAI_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL = 'grok-beta';

export class XAIProvider extends AIProvider {
  readonly name = 'xai';
  readonly isLocal = false;

  private apiKey: string;
  private model: string;

  constructor(
    apiKey = process.env.XAI_API_KEY || '',
    model = process.env.XAI_MODEL || DEFAULT_MODEL,
  ) {
    super();
    this.apiKey = apiKey;
    this.model = model;
  }

  requiresApiKey(): boolean { return true; }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.apiKey) errors.push('XAI_API_KEY is not set');
    if (!this.model)  errors.push('XAI_MODEL is not set');
    return { valid: errors.length === 0, errors };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + this.apiKey,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    if (!this.apiKey) {
      return { isHealthy: false, provider: this.name, error: 'XAI_API_KEY not configured' };
    }
    try {
      // A minimal models list call to confirm auth and connectivity
      const res = await fetch(XAI_BASE_URL + '/models', {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return {
        isHealthy: true,
        provider: this.name,
        latencyMs: Date.now() - start,
        details: { model: this.model },
      };
    } catch (err) {
      return {
        isHealthy: false,
        provider: this.name,
        error: err instanceof Error ? err.message : 'Unknown error',
        details: { model: this.model },
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{
      id: this.model,
      name: this.model,
      provider: 'xai',
      isLocal: false,
      description: 'Grok via xAI',
    }];
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<AIResponse> {
    const cfg = this.validateConfig();
    if (!cfg.valid) throw new Error('xAI not configured: ' + cfg.errors.join(', '));

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      stream: false,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(XAI_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error('xAI error: HTTP ' + res.status + ' - ' + errText.slice(0, 200));
    }

    const data = await res.json() as OAIResponse;
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      model: data.model || this.model,
      provider: 'xai',
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      finishReason: choice?.finish_reason,
    };
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncGenerator<StreamChunk> {
    const cfg = this.validateConfig();
    if (!cfg.valid) {
      yield { type: 'error', error: 'xAI not configured: ' + cfg.errors.join(', ') };
      return;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      stream: true,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const res = await fetch(XAI_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok || !res.body) {
      yield { type: 'error', error: 'xAI stream error: HTTP ' + res.status };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { yield { type: 'done' }; continue; }
          try {
            const chunk = JSON.parse(raw) as { choices: Array<{ delta: { content?: string } }> };
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield { type: 'text', content };
          } catch { /* skip malformed SSE */ }
        }
      }
    } finally { reader.releaseLock(); }
  }
}

interface OAIResponse {
  model?: string;
  choices: Array<{ message: { role: string; content: string }; finish_reason?: string }>;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}
