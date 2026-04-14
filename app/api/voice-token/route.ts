import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';
import { getSettings } from '@/lib/db/settings';

import clientPromise from '@/lib/auth-client';

interface VoiceRateLimit {
  _id: string;
  count: number;
  createdAt: Date;
}

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
    }

    const userId = session.user.id;
    const client = await clientPromise;
    const db = client.db(env.DB_NAME);
    const rateLimits = db.collection<VoiceRateLimit>('voice_rate_limits');

    await rateLimits.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const code = typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code?: number }).code
        : undefined;
      const isDuplicate = code === 85 || code === 86 || /already exists|IndexOptionsConflict|IndexKeySpecsConflict/i.test(message);
      if (isDuplicate) return;

      console.error('[voice-token] Failed to create rate limit index:', err);
    });

    const rateLimitResult = await rateLimits.findOneAndUpdate(
      { _id: userId },
      {
        $inc: { count: 1 },
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true, returnDocument: 'after' }
    );

    const doc = (rateLimitResult && 'value' in rateLimitResult
      ? rateLimitResult.value
      : rateLimitResult) as VoiceRateLimit | null | undefined;

    if (doc && doc.count > 5) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for voice tokens. Try again later.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': '60' } },
      );
    }

    const settings = await getSettings();
    const voiceConfig = settings?.voiceConfig;
    const deepgramApiKey = voiceConfig?.apiKey || env.DEEPGRAM_API_KEY;

    if (!deepgramApiKey) {
      return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
    }

    const deepgram = createClient(deepgramApiKey);
    const ttlSource = voiceConfig?.tokenTtl ?? env.DEEPGRAM_TOKEN_TTL;
    const ttlSecondsRaw = Number.parseInt(String(ttlSource), 10);
    const ttlSeconds = Number.isFinite(ttlSecondsRaw) && ttlSecondsRaw > 0 ? ttlSecondsRaw : 3600;
    const { result, error } = await deepgram.auth.grantToken({
      ttl_seconds: ttlSeconds,
    });

    if (error || !result) {
      console.error('[Deepgram] Failed to generate token:', error);
      return errorResponse('INTERNAL_ERROR', 'Failed to generate voice credentials', 500);
    }

    return NextResponse.json({
      token: result.access_token,
      config: {
        sttModel: voiceConfig?.sttModel || env.DEEPGRAM_STT_MODEL,
        ttsModel: voiceConfig?.ttsModel || env.DEEPGRAM_TTS_MODEL,
        thinkModel: voiceConfig?.thinkModel || env.DEEPGRAM_THINK_MODEL,
      },
    });
  } catch (error) {
    console.error('[voice-token] error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to create voice token', 500, error);
  }
}
