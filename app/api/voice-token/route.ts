import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';

import clientPromise from '@/lib/auth-client';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }

  const userId = session.user.id;
  const client = await clientPromise;
  const db = client.db(env.DB_NAME);
  interface VoiceRateLimit {
    _id: string;
    count: number;
    createdAt: Date;
  }
  const rateLimits = db.collection<VoiceRateLimit>('voice_rate_limits');

  // Ensure TTL index for automatic cleanup across all instances
  await rateLimits.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 }).catch(() => {});

  const rateLimitResult = await rateLimits.findOneAndUpdate(
    { _id: userId },
    {
      $inc: { count: 1 },
      $setOnInsert: { createdAt: new Date() }
    },
    { upsert: true, returnDocument: 'after' }
  );

  const doc = (rateLimitResult && typeof rateLimitResult === 'object' && 'value' in rateLimitResult 
    ? rateLimitResult.value 
    : rateLimitResult) as VoiceRateLimit | null | undefined;
  
  if (doc && doc.count > 5) {
    return errorResponse('RATE_LIMITED', 'Rate limit exceeded for voice tokens. Try again later.', 429);
  }

  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
  }

  const deepgram = createClient(env.DEEPGRAM_API_KEY);
  const { result, error } = await deepgram.auth.grantToken({ timeToLive: Number(env.DEEPGRAM_TOKEN_TTL) });

  if (error || !result) {
    console.error('[Deepgram] Failed to generate token:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to generate voice credentials', 500);
  }

  return NextResponse.json({
    token: result.access_token,
    config: {
      sttModel: env.DEEPGRAM_STT_MODEL,
      ttsModel: env.DEEPGRAM_TTS_MODEL,
      thinkModel: env.DEEPGRAM_THINK_MODEL,
    },
  });
}
