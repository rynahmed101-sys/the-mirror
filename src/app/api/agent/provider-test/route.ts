/**
 * THE MIRROR - Provider Test Endpoint
 *
 * GET  /api/agent/provider-test          - Returns active provider config & health
 * POST /api/agent/provider-test          - Sends a real completion request and returns result
 *
 * Query params for POST:
 *   ?provider=openrouter|xai|ollama      Override active provider for this request
 *
 * Used for infrastructure verification ONLY.
 * Requires MIRROR_API_TOKEN authentication.
 * Never exposes API keys.
 */

import { NextResponse } from 'next/server';
import { aiRegistry } from '@/lib/ai/registry';

function authenticate(req: Request): boolean {
  const token = process.env.MIRROR_API_TOKEN;
  if (!token) return false;
  const auth = req.headers.get('Authorization') || '';
  return auth === 'Bearer ' + token;
}

export async function GET(req: Request) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activeProvider = aiRegistry.getActiveProviderName();
  const health = await aiRegistry.healthCheckFull(activeProvider);

  return NextResponse.json({
    activeProvider,
    activeModel: aiRegistry.getActiveModel(),
    health,
    availableProviders: aiRegistry.listProviders(),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  if (!authenticate(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const providerOverride = url.searchParams.get('provider');

  let body: { prompt?: string; agentId?: string } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const prompt = body.prompt || 'In exactly one sentence, confirm your model identity and that you received this test message.';
  const agentId = body.agentId || 'mirror-primary';

  const providerName = providerOverride || aiRegistry.getActiveProviderName();
  const provider = aiRegistry.getProvider(providerName as never);

  const start = Date.now();
  try {
    const response = await provider.complete([
      {
        role: 'system',
        content: 'You are a production verification assistant for THE MIRROR research platform. Be concise and accurate.',
      },
      { role: 'user', content: prompt },
    ], {
      temperature: 0.3,
      maxTokens: 256,
    });

    const latencyMs = Date.now() - start;

    return NextResponse.json({
      success: true,
      provider: response.provider,
      model: response.model,
      agentId,
      prompt,
      response: response.content,
      nonEmpty: response.content.trim().length > 0,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      finishReason: response.finishReason,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      provider: providerName,
      model: null,
      agentId,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    }, { status: 502 });
  }
}
