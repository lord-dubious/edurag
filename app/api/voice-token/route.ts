import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';
import { auth } from '@/auth';

const DEEPGRAM_GRANT_URL = 'https://api.deepgram.com/v1/auth/grant';
const DEFAULT_TOKEN_TTL = 3600;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
  }

  const ttl = env.DEEPGRAM_TOKEN_TTL ?? DEFAULT_TOKEN_TTL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(DEEPGRAM_GRANT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ time_to_live_in_seconds: ttl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text();
      console.error('[voice-token] Deepgram grant failed:', res.status, body);
      return errorResponse('INTERNAL_ERROR', 'Failed to generate temporary token', 502);
    }

    const data: { access_token: string; expires_in: number } = await res.json();

    if (
      typeof data.access_token !== 'string' ||
      !data.access_token.trim() ||
      !Number.isFinite(data.expires_in)
    ) {
      console.error('[voice-token] Invalid grant response:', JSON.stringify(data));
      return errorResponse('INTERNAL_ERROR', 'Deepgram returned an invalid token response', 502);
    }

    return NextResponse.json({
      token: data.access_token,
      expiresIn: data.expires_in,
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('[voice-token] Deepgram grant request timed out');
      return errorResponse('INTERNAL_ERROR', 'Deepgram token request timed out', 504);
    }
    console.error('[voice-token] Deepgram grant request error:', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to contact Deepgram', 502);
  }
}
