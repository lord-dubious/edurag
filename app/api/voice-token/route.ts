import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';
import { createClient } from '@deepgram/sdk';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// In-memory rate limiting: Max 5 connections per minute per user
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const MAX_REQUESTS = 5;

export async function GET() {
  // 1. Enforce authentication
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }

  const userId = session.user.id;
  const now = Date.now();

  // 2. Apply rate limiting
  const userRateLimit = rateLimitMap.get(userId);
  if (!userRateLimit || userRateLimit.expiresAt < now) {
    rateLimitMap.set(userId, { count: 1, expiresAt: now + RATE_LIMIT_WINDOW });
  } else {
    if (userRateLimit.count >= MAX_REQUESTS) {
      return errorResponse('RATE_LIMITED', 'Rate limit exceeded for voice tokens. Try again later.', 429);
    }
    userRateLimit.count++;
  }

  // 3. Generate Token
  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
  }

  const deepgram = createClient(env.DEEPGRAM_API_KEY);
  const { result, error } = await deepgram.auth.grantToken({ timeToLive: 600 });

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
