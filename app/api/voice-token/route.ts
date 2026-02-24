import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET() {
  if (!env.DEEPGRAM_API_KEY) {
    return NextResponse.json(
      { error: 'Deepgram API key not configured' },
      { status: 500 }
    );
  }

  return NextResponse.json({ apiKey: env.DEEPGRAM_API_KEY });
}
