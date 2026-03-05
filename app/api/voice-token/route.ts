import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';

export async function GET(): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!env.DEEPGRAM_API_KEY || !env.DEEPGRAM_PROJECT_ID) {
    return errorResponse('INTERNAL_ERROR', 'Voice not configured', 500);
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(
        `https://api.deepgram.com/v1/projects/${env.DEEPGRAM_PROJECT_ID}/keys`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: `session-${Date.now()}`,
            scopes: ['usage:write'],
            time_to_live_in_seconds: 90,
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) throw new Error(`Deepgram key API returned ${res.status}`);
      const { key } = await res.json();
      if (typeof key !== 'string' || key.trim() === '') {
        return errorResponse('INTERNAL_ERROR', 'Invalid Deepgram response', 502);
      }
      return NextResponse.json({ apiKey: key });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('[VoiceToken]', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to issue voice token', 500);
  }
}
