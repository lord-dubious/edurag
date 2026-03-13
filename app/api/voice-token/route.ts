import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';



export async function GET() {

  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
  }

  return NextResponse.json({
    token: env.DEEPGRAM_API_KEY,
    config: {
      sttModel: env.DEEPGRAM_STT_MODEL,
      ttsModel: env.DEEPGRAM_TTS_MODEL,
      thinkModel: env.DEEPGRAM_THINK_MODEL,
    },
  });
}
