import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }

  if (!env.DEEPGRAM_API_KEY) {
    return errorResponse('INTERNAL_ERROR', 'Deepgram API key not configured', 500);
  }

  return NextResponse.json({ apiKey: env.DEEPGRAM_API_KEY });
}
