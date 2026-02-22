import OpenAI from 'openai';
import type { WebSocket } from 'ws';
import { env } from '@/lib/env';
import { createClient, LiveTTSEvents } from '@deepgram/sdk';
import { getTTSConfig } from './ttsProvider';
import type { AgentOutput } from './voiceTypes';

const SENTENCE_RE = /[.!?]\s/;
const MAX_BUFFER = 120;

export function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/【\d+†[^\]]+】/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type { AgentOutput as AgentChunk } from './voiceTypes';

export function createChunkIterator(
  chunks: AgentOutput[],
  signal: AbortSignal,
  doneFlag: { value: boolean }
): AsyncIterable<AgentOutput> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        async next() {
          if (signal.aborted) return { done: true, value: undefined };
          while (i < chunks.length) {
            return { done: false, value: chunks[i++] };
          }
          if (doneFlag.value) {
            return { done: false, value: { type: 'agent_done' as const } };
          }
          await new Promise((r) => setTimeout(r, 10));
          return { done: true, value: undefined };
        },
      };
    },
  };
}

export async function* chunkSentences(
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

async function* streamDeepgramTTS(
  textSource: AsyncIterable<string>,
  model: string,
  apiKey: string,
  signal: AbortSignal
): AsyncGenerator<Buffer> {
  const dg = createClient(apiKey);
  const pendingChunks: Buffer[] = [];
  let resolveChunk: ((value: IteratorResult<Buffer>) => void) | null = null;
  let done = false;

  const connection = dg.speak.live({
    model,
    encoding: 'linear16',
    sample_rate: 24000,
  });

  connection.on(LiveTTSEvents.Open, () => {
    // Connection ready
  });

  connection.on(LiveTTSEvents.Audio, (data: Buffer) => {
    if (resolveChunk) {
      resolveChunk({ done: false, value: data });
      resolveChunk = null;
    } else {
      pendingChunks.push(data);
    }
  });

  connection.on(LiveTTSEvents.Error, (err: Error) => {
    done = true;
    if (resolveChunk) {
      resolveChunk({ done: true, value: undefined });
    }
  });

  connection.on(LiveTTSEvents.Close, () => {
    done = true;
    if (resolveChunk) {
      resolveChunk({ done: true, value: undefined });
    }
  });

  // Send text chunks
  (async () => {
    for await (const text of textSource) {
      if (signal.aborted) break;
      connection.sendText(text);
    }
    if (!signal.aborted) {
      connection.flush();
    }
  })().catch(() => {});

  // Yield audio chunks
  while (!done && !signal.aborted) {
    if (pendingChunks.length > 0) {
      yield pendingChunks.shift()!;
    } else {
      await new Promise<void>((resolve) => {
        resolveChunk = () => resolve();
        setTimeout(() => resolve(), 100);
      });
    }
  }

  connection.requestClose();
}

export async function streamTTS(
  source: AsyncIterable<{ type: 'agent_chunk'; text: string } | { type: 'agent_done' }>,
  signal: AbortSignal,
  ws: WebSocket
): Promise<void> {
  const config = getTTSConfig();
  if (!config) {
    ws.send(JSON.stringify({ type: 'error', message: 'No TTS provider configured' }));
    return;
  }

  const sentenceStream = chunkSentences(source);

  if (config.provider === 'deepgram') {
    // Deepgram streaming
    for await (const chunk of streamDeepgramTTS(sentenceStream, config.model, config.apiKey, signal)) {
      if (signal.aborted) return;
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'agent_audio', audio: chunk.toString('base64') }));
      }
    }
  } else {
    // OpenAI-compatible
    const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });

    for await (const sentence of sentenceStream) {
      if (signal.aborted) return;
      if (!sentence) continue;

      try {
        const response = await client.audio.speech.create({
          model: config.model,
          voice: env.VOICE_TTS_VOICE || 'nova',
          input: sentence,
          response_format: 'pcm',
        });

        const reader = response.body?.getReader();
        if (!reader) continue;

        try {
          while (!signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && ws.readyState === 1) {
              const base64 = Buffer.from(value).toString('base64');
              ws.send(JSON.stringify({ type: 'agent_audio', audio: base64 }));
            }
          }
        } finally {
          if (signal.aborted) {
            try {
              await reader.cancel();
            } catch {
              // Ignore cancel errors
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        console.error('TTS error:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'TTS service temporarily unavailable' }));
      }
    }
  }
}
