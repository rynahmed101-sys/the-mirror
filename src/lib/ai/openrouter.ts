/**
 * THE MIRROR - OpenRouter Provider
 *
 * Provides access to Meta Llama via OpenRouter OpenAI-compatible API.
 * https://openrouter.ai/api/v1/chat/completions
 *
 * Required env: OPENROUTER_API_KEY
 * Optional env: OPENROUTER_MODEL (default: meta-llama/llama-3.3-70b-instruct)
 *               OPENROUTER_SITE_URL, OPENROUTER_SITE_NAME
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

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'meta-llama/llama-3.3-70b-instruct';

export class OpenRouterProvider extends AIProvider {
  readonly name = 'openrouter';
  readonly isLocal = false;

  private apiKey: string;
  private model: string;
  private siteUrl: string;
  private siteName: string;

  constructor(
    apiKey = process.env.OPENROUTER_API_KEY || '',
    model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    siteUrl = process.env.OPENROUTER_SITE_URL || 'https://the-mirror-gules.vercel.app',
    siteName = process.env.OPENROUTER_SITE_NAME || 'THE MIRROR',
  ) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.siteUrl = siteUrl;
    this.siteName = siteName;
  }

  requiresApiKey(): boolean { return true; }

  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.apiKey) errors.push('OPENROUTER_API_KEY is not set');
    if (!this.model)  errors.push('OPENROUTER_MODEL is not set');
    return { valid: errors.length === 0, errors };
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + this.apiKey,
      'HTTP-Referer': this.siteUrl,
      'X-Title': this.siteName,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    if (!this.apiKey) {
      return { isHealthy: false, provider: this.name, error: 'OPENROUTER_API_KEY not configured' };
    }
    try {
      const res = await fetch(OPENROUTER_BASE_URL + '/models', {
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
      provider: 'openrouter',
      isLocal: false,
      description: 'Meta Llama via OpenRouter',
    }];
  }

  async complete(messages: ChatMessage[], options: CompletionOptions = {}): Promise<AIResponse> {
    const cfg = this.validateConfig();
    if (!cfg.valid) throw new Error('OpenRouter not configured: ' + cfg.errors.join(', '));

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

    const res = await fetch(OPENROUTER_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error('OpenRouter error: HTTP ' + res.status + ' - ' + errText.slice(0, 200));
    }

    const data = await res.json() as OAIResponse;
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content || '',
      model: data.model || this.model,
      provider: 'openrouter',
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      finishReason: choice?.finish_reason,
    };
  }

  async *stream(messages: ChatMessage[], options: CompletionOptions = {}): AsyncGenerator<StreamChunk> {
    const cfg = this.validateConfig();
    if (!cfg.valid) {
      yield { type: 'error', error: 'OpenRouter not configured: ' + cfg.errors.join(', ') };
      return;
    }

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options.temperature ?? 0.7,
      stream: true,
    };
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const res = await fetch(OPENROUTER_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok || !res.body) {
      yield { type: 'error', error: 'OpenRouter stream error: HTTP ' + res.status };
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
