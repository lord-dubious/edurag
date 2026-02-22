import OpenAI from 'openai';
import { env } from '@/lib/env';

let _ttsClient: OpenAI | undefined;

function getTTSClient(): OpenAI {
  if (!_ttsClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    _ttsClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _ttsClient;
}

async function* streamTTS(
  text: string,
  signal?: AbortSignal,
): AsyncGenerator<Buffer> {
  const client = getTTSClient();

  const response = await client.audio.speech.create(
    {
      model: env.VOICE_TTS_MODEL,
      voice: env.VOICE_TTS_VOICE as OpenAI.Audio.Speech.SpeechCreateParams['voice'],
      input: text,
      response_format: 'pcm',
    },
    {
      signal,
    },
  );

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      yield Buffer.from(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export { getTTSClient, streamTTS };
