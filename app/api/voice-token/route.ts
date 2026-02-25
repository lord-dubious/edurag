import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET() {
  if (!env.DEEPGRAM_API_KEY) {
    return NextResponse.json(
      { error: 'Deepgram API key not configured' },
      { status: 500 }
    );
  }

  try {
    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ time_to_live_in_seconds: 60 }),
    });

    if (!res.ok) {
      console.error('[voice-token] Grant failed:', res.status, await res.text());
      return NextResponse.json(
        { error: 'Failed to mint voice token' },
        { status: 502 }
      );
    }

    const data = await res.json() as { key: string };
    return NextResponse.json({ apiKey: data.key });
  } catch (err) {
    console.error('[voice-token] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
