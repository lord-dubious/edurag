import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { ListenLiveClient } from '@deepgram/sdk';

interface DeepgramCallbacks {
  onSpeechStart: () => void;
  onInterim: (text: string) => void;
  onUtteranceEnd: (text: string) => void;
  onSpeechEnd: () => void;
  onError: (message: string) => void;
  onReady: () => void;
  onClose?: (reason?: string) => void;
}

interface DeepgramConnection {
  sendAudio: (audio: Buffer) => void;
  close: () => void;
  isSpeaking: () => boolean;
}

function createDeepgramConnection(options: {
  apiKey: string;
  model?: string;
  sampleRate?: number;
  language?: string;
} & DeepgramCallbacks): DeepgramConnection {
  const {
    apiKey,
    model = 'nova-3',
    sampleRate = 16000,
    language = 'en-US',
    onSpeechStart,
    onInterim,
    onUtteranceEnd,
    onSpeechEnd,
    onError,
    onReady,
    onClose,
  } = options;

  const deepgram = createClient(apiKey);
  let speaking = false;
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  let pendingFinals: string[] = [];

  const connection: ListenLiveClient = deepgram.listen.live({
    model,
    language,
    encoding: 'linear16',
    sample_rate: sampleRate,
    channels: 1,
    interim_results: true,
    endpointing: 300,
    utterance_end_ms: 1200,
  });

  connection.on(LiveTranscriptionEvents.Open, () => {
    keepaliveInterval = setInterval(() => {
      try {
        connection.keepAlive();
      } catch {
        if (keepaliveInterval) clearInterval(keepaliveInterval);
      }
    }, 8000);
    onReady();
  });

  connection.on(LiveTranscriptionEvents.SpeechStarted, () => {
    speaking = true;
    onSpeechStart();
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data: unknown) => {
    const event = data as { type: string; channel?: { alternatives: Array<{ transcript: string }> }; is_final?: boolean };
    const transcript = event.channel?.alternatives?.[0]?.transcript ?? '';
    if (transcript) {
      if (event.is_final) {
        pendingFinals.push(transcript);
      } else {
        onInterim(transcript);
      }
    }
  });

  connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    if (pendingFinals.length > 0) {
      const text = pendingFinals.join(' ');
      pendingFinals = [];
      speaking = false;
      onUtteranceEnd(text);
      onSpeechEnd();
    }
  });

  connection.on(LiveTranscriptionEvents.Error, (err: unknown) => {
    const message = err instanceof Error ? err.message : 'Deepgram error';
    onError(message);
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    speaking = false;
    onClose?.();
  });

  return {
    sendAudio: (audio: Buffer) => {
      if (connection.isConnected()) {
        connection.send(audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength));
      }
    },
    close: () => {
      if (keepaliveInterval) clearInterval(keepaliveInterval);
      connection.finish();
    },
    isSpeaking: () => speaking,
  };
}

export default createDeepgramConnection;

export type { DeepgramCallbacks, DeepgramConnection };
