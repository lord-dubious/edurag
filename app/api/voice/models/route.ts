import { createClient } from '@deepgram/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('X-Deepgram-Key') || env.DEEPGRAM_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ models: [] });
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

export async function POST(request: NextRequest) {
  let apiKey: string | undefined;
  
  try {
    const body = await request.json();
    apiKey = body.deepgramApiKey;
  } catch {
    // Invalid JSON body
  }

  if (!apiKey) {
    apiKey = env.DEEPGRAM_API_KEY;
  }

  if (!apiKey) {
    return NextResponse.json({ models: [] });
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
