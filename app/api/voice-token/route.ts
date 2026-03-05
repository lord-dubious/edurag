import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';
import { auth } from '@/auth';

const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
const DEFAULT_TOKEN_TTL = 3600;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
  }

  const ttl = env.DEEPGRAM_TOKEN_TTL ?? DEFAULT_TOKEN_TTL;

  try {
    const res = await fetch(DEEPGRAM_GRANT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ time_to_live_in_seconds: ttl }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[voice-token] Deepgram grant failed:', res.status, body);
      return errorResponse('INTERNAL_ERROR', 'Failed to generate temporary token', 502);
    }

    const data: { access_token: string; expires_in: number } = await res.json();
    return NextResponse.json({
      token: data.access_token,
      expiresIn: data.expires_in,
    });
  } catch (err) {
    console.error('[voice-token] Deepgram grant request error:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to contact Deepgram', 502);
  }
}
