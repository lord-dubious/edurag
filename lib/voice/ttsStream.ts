import OpenAI from 'openai';
import type { WebSocket } from 'ws';
import { env } from '@/lib/env';

const SENTENCE_RE = /[.!?]\s/;
const MAX_BUFFER = 120;

function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/【\d+†[^\]]+】/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let _ttsClient: OpenAI | undefined;

function getTTSClient(): OpenAI {
  if (!_ttsClient) {
    const apiKey = env.VOICE_TTS_API_KEY;
    if (!apiKey) {
      throw new Error('VOICE_TTS_API_KEY is not set');
    }
    _ttsClient = new OpenAI({
      apiKey,
      baseURL: env.VOICE_TTS_BASE_URL,
    });
  }
  return _ttsClient;
}

async function* chunkSentences(
  source: AsyncIterable<{ type: 'agent_chunk'; text: string } | { type: 'agent_done' }>
): AsyncGenerator<string> {
  let buffer = '';

  for await (const chunk of source) {
    if (chunk.type === 'agent_done') {
      if (buffer.trim()) yield cleanForSpeech(buffer);
      return;
    }
    buffer += chunk.text;
    let match;
    while ((match = SENTENCE_RE.exec(buffer)) !== null) {
      const sentence = buffer.slice(0, match.index + 1);
      buffer = buffer.slice(match.index + 2);
      if (sentence.trim()) yield cleanForSpeech(sentence);
    }
    if (buffer.length > MAX_BUFFER) {
      if (buffer.trim()) yield cleanForSpeech(buffer);
      buffer = '';
    }
  }
}

export async function streamTTS(
  chunks: Array<{ type: 'agent_chunk'; text: string } | { type: 'agent_done' }>,
  signal: AbortSignal,
  ws: WebSocket
): Promise<void> {
  const client = getTTSClient();
  const chunkIterator: AsyncIterable<{ type: 'agent_chunk'; text: string } | { type: 'agent_done' }> = {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (signal.aborted) return { done: true, value: undefined };
          while (i < chunks.length) {
            return { done: false, value: chunks[i++] };
          }
          await new Promise((r) => setTimeout(r, 50));
          if (signal.aborted) return { done: true, value: undefined };
          return { done: false, value: { type: 'agent_done' as const } };
        },
      };
    },
  };

  for await (const sentence of chunkSentences(chunkIterator)) {
    if (signal.aborted) return;
    if (!sentence) continue;

    try {
      const response = await client.audio.speech.create({
        model: env.VOICE_TTS_MODEL,
        voice: env.VOICE_TTS_VOICE,
        input: sentence,
        response_format: 'pcm',
      });

      const reader = response.body?.getReader();
      if (!reader) continue;

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && ws.readyState === 1) {
          const base64 = Buffer.from(value).toString('base64');
          ws.send(JSON.stringify({ type: 'agent_audio', audio: base64 }));
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      console.error('TTS error:', err);
    }
  }
}
