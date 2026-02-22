import { createClient } from '@deepgram/sdk';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET() {
  const apiKey = env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'DEEPGRAM_API_KEY is not configured' },
      { status: 400 },
    );
  }

  try {
    const deepgram = createClient(apiKey);
    const { result, error } = await deepgram.models.getAll();

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Failed to fetch models' },
        { status: 500 },
      );
    }

    const ttsModels = result?.tts ?? [];

    const models = ttsModels.map((model) => ({
      name: model.name,
      description: model.canonical_name,
      language: model.languages?.[0] ?? 'unknown',
    }));

    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch models';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
