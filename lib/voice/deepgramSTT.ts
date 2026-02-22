import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { LiveTranscriptionEvent, ListenLiveClient } from '@deepgram/sdk';
import { env } from '@/lib/env';
import type { DEFAULT_VOICE_CONFIG } from './voiceTypes';

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
}

export interface DeepgramConnection {
  sendAudio: (audio: Buffer) => void;
  close: () => void;
  isSpeaking: () => boolean;
}

export type OnTranscriptCallback = (result: TranscriptResult) => void;
export type OnErrorCallback = (message: string) => void;

export interface CreateDeepgramParams {
  apiKey: string;
  onTranscript: OnTranscriptCallback;
  onError: OnErrorCallback;
  model?: typeof DEFAULT_VOICE_CONFIG.model;
  sampleRate?: number;
  language?: typeof DEFAULT_VOICE_CONFIG.language;
}

export function CreateDeepgramConnection(params: CreateDeepgramParams): DeepgramConnection {
  const {
    apiKey,
    onTranscript,
    onError,
    model = 'nova-3',
    sampleRate = 16000,
    language = 'en-US',
  } = params;

  const deepgram = createClient(apiKey);
  const vadMs = env.VOICE_VAD_MS;
  const keepaliveMs = env.VOICE_KEEPALIVE_MS;

  let speaking = false;
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let connection: ListenLiveClient;

  connection = deepgram.listen.live({
    model,
    language,
    encoding: 'linear16',
    sample_rate: sampleRate,
    channels: 1,
    interim_results: true,
    endpointing: vadMs,
  });

  keepaliveInterval = setInterval(() => {
    try {
      if (connection.isConnected()) {
        connection.keepAlive();
      }
    } catch {
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }
    }
  }, keepaliveMs);

  connection.on(LiveTranscriptionEvents.Open, () => {
    speaking = true;
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data: LiveTranscriptionEvent) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    const isFinal = data.is_final ?? false;

    if (transcript && transcript.trim().length > 0) {
      onTranscript({
        text: transcript,
        isFinal,
      });
    }
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    speaking = false;
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
    onError('Deepgram connection closed');
  });

  connection.on(LiveTranscriptionEvents.Error, (error: unknown) => {
    speaking = false;
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
    let message: string;
    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'object' && error !== null && 'message' in error) {
      message = String((error as { message: unknown }).message);
    } else {
      message = 'Unknown Deepgram error';
    }
    onError(message);
  });

  return {
    sendAudio: (audio: Buffer) => {
      try {
        connection.send(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send audio';
        onError(message);
      }
    },
    close: () => {
      speaking = false;
      if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
      }
      try {
        connection.requestClose();
      } catch {
        // Connection may already be closed
      }
    },
    isSpeaking: () => speaking,
  };
}
