import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Voice not configured', 500);
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        'https://api.deepgram.com/v1/auth/grant',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ttl_seconds: 90,
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) throw new Error(`Deepgram auth/grant returned ${res.status}`);
      const payload = await res.json();
      const token = payload?.access_token;
      if (typeof token !== 'string' || token.trim() === '') {
        return errorResponse('INTERNAL_ERROR', 'Invalid Deepgram response', 502);
      }
      return NextResponse.json({ apiKey: token });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('[VoiceToken]', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to issue voice token', 500);
  }
}
