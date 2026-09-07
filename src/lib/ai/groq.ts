/**
 * THE MIRROR - Groq Provider
 *
 * Calls Groq's ultra-fast inference API via its OpenAI-compatible endpoint.
 * https://api.groq.com/openai/v1/chat/completions
 *
 * NOTE: This is Groq (groq.com) — high-speed LLM inference.
 * Not to be confused with xAI Grok (different company, different product).
 *
 * Required env: GROQ_API_KEY   (prefix: gsk_)
 * Optional env: GROQ_MODEL     (default: llama-3.3-70b-versatile)
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

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export class GroqProvider extends AIProvider {
  readonly name = 'groq';
  readonly isLocal = false;

  private apiKey: string;
  private model: string;

  constructor(
    apiKey = process.env.GROQ_API_KEY || '',
    model  = process.env.GROQ_MODEL  || DEFAULT_MODEL,
  ) {
    super();
    this.apiKey = apiKey;
    this.model  = model;
  }

  requiresApiKey(): boolean { return true; }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.apiKey) errors.push('GROQ_API_KEY is not set');
    if (!this.model)  errors.push('GROQ_MODEL is not set');
    return { valid: errors.length === 0, errors };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + this.apiKey,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    if (!this.apiKey) {
      return { isHealthy: false, provider: this.name, error: 'GROQ_API_KEY not configured' };
    }
    try {
      const res = await fetch(GROQ_BASE_URL + '/models', {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return {
        isHealthy: true, provider: this.name,
        latencyMs: Date.now() - start,
        details: { model: this.model, baseUrl: GROQ_BASE_URL },
      };
    } catch (err) {
      return {
        isHealthy: false, provider: this.name,
        error: err instanceof Error ? err.message : 'Unknown error',
        details: { model: this.model },
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    return [{
      id: this.model,
      name: this.model,
      provider: 'groq',
      isLocal: false,
      description: 'Meta Llama via Groq (ultra-fast inference)',
    }];
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<AIResponse> {
    const cfg = this.validateConfig();
    if (!cfg.valid) throw new Error('Groq not configured: ' + cfg.errors.join(', '));

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

    const res = await fetch(GROQ_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error('Groq error: HTTP ' + res.status + ' - ' + errText.slice(0, 200));
    }

    const data = await res.json() as OAIResponse;
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      model: data.model || this.model,
      provider: 'groq',
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      finishReason: choice?.finish_reason,
    };
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncGenerator<StreamChunk> {
    const cfg = this.validateConfig();
    if (!cfg.valid) {
      yield { type: 'error', error: 'Groq not configured: ' + cfg.errors.join(', ') };
      return;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      stream: true,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const res = await fetch(GROQ_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok || !res.body) {
      yield { type: 'error', error: 'Groq stream error: HTTP ' + res.status };
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
