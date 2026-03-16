import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import { verifyAdmin } from '@/lib/admin-auth';
import { errorResponse } from '@/lib/errors';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/db/settings';
import { resolveFallbackChatModel, resolvePrimaryChatModel } from '@/lib/agent';

type PingResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

async function runPing(model: LanguageModel): Promise<PingResult> {
  const started = Date.now();
  try {
    await generateText({
      model,
      prompt: 'ping',
      maxTokens: 1,
      temperature: 0,
    });
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ping failed';
    return { ok: false, latencyMs: Date.now() - started, error: message };
  }
}

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  const settings = await getSettings();
  const chatConfig = settings?.chatConfig;
  const primaryConfig = {
    model: chatConfig?.model || env.CHAT_MODEL,
    baseUrl: chatConfig?.baseUrl || env.CHAT_BASE_URL || null,
    hasApiKey: Boolean(chatConfig?.apiKey || env.CHAT_API_KEY),
  };

  const fallbackReady = Boolean(env.CHAT_FALLBACK_MODEL && (env.CHAT_FALLBACK_API_KEY || env.CHAT_API_KEY));
  const fallbackConfig = {
    enabled: Boolean(env.CHAT_FALLBACK_MODEL),
    model: env.CHAT_FALLBACK_MODEL || null,
    baseUrl: env.CHAT_FALLBACK_BASE_URL || env.CHAT_BASE_URL || null,
    hasApiKey: Boolean(env.CHAT_FALLBACK_API_KEY || env.CHAT_API_KEY),
    ready: fallbackReady,
  };

  const url = new URL(req.url);
  const ping = url.searchParams.get('ping') === '1';
  const target = url.searchParams.get('model') || 'primary';

  const payload: {
    ok: boolean;
    primary: typeof primaryConfig;
    fallback: typeof fallbackConfig;
    ping?: { primary?: PingResult; fallback?: PingResult };
  } = {
    ok: true,
    primary: primaryConfig,
    fallback: fallbackConfig,
  };

  if (ping) {
    const pingResults: { primary?: PingResult; fallback?: PingResult } = {};

    if (target === 'primary' || target === 'both') {
      if (!primaryConfig.hasApiKey) {
        pingResults.primary = { ok: false, latencyMs: 0, error: 'Missing primary API key' };
      } else {
        pingResults.primary = await runPing(resolvePrimaryChatModel(settings));
      }
    }

    if (target === 'fallback' || target === 'both') {
      const fallbackModel = resolveFallbackChatModel();
      if (!fallbackModel) {
        pingResults.fallback = { ok: false, latencyMs: 0, error: 'Fallback not configured' };
      } else {
        pingResults.fallback = await runPing(fallbackModel);
      }
    }

    payload.ping = pingResults;
  }

  return NextResponse.json(payload);
}
