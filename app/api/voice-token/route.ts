import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';
import { createClient } from '@deepgram/sdk';



export async function GET() {

  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
  }

  const deepgram = createClient(env.DEEPGRAM_API_KEY);
  const { result, error } = await deepgram.auth.grantToken({ timeToLive: 60 });

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
