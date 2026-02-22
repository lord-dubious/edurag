import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { CreateDeepgramConnection } from './lib/voice/deepgramSTT';
import runVoiceAgent from './lib/voice/agentBridge';
import { streamTTS } from './lib/voice/ttsStream';
import type { VoiceEvent, AgentState } from './lib/voice/voiceTypes';
import { env } from './lib/env';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

interface PendingTurn {
  text: string;
}

interface VoiceSession {
  ws: WebSocket;
  deepgram: ReturnType<typeof CreateDeepgramConnection>;
  processingLock: boolean;
  pendingTurns: PendingTurn[];
  interimTranscript: string;
  abortController: AbortController | null;
  audioBuffer: Buffer[];
  audioBufferSize: number;
  agentState: AgentState;
}

function sendEvent(ws: WebSocket, event: VoiceEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function setAgentState(session: VoiceSession, state: AgentState): void {
  session.agentState = state;
  sendEvent(session.ws, { type: 'agent_state', state });
}

function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let current = '';
  let i = 0;

  while (i < text.length) {
    current += text[i];
    const char = text[i];
    
    if (char === '.' || char === '!' || char === '?') {
      if (i + 1 < text.length && text[i + 1] === ' ') {
        sentences.push(current.trim());
        current = '';
        i++;
      } else if (i + 1 >= text.length) {
        sentences.push(current.trim());
        current = '';
      }
    }
    i++;
  }

  if (current.trim().length > 0) {
    sentences.push(current.trim());
  }

  return sentences.filter(s => s.length > 0);
}

async function processTurn(session: VoiceSession, text: string): Promise<void> {
  session.processingLock = true;
  session.abortController = new AbortController();
  session.audioBuffer = [];
  session.audioBufferSize = 0;

  setAgentState(session, 'thinking');

  let fullText = '';

  try {
    await runVoiceAgent(
      text,
      async (chunk: string) => {
        if (session.abortController?.signal.aborted) {
          return;
        }
        fullText += chunk;

        const sentences = splitIntoSentences(fullText);
        if (sentences.length > 1) {
          const sentenceToSpeak = sentences[0];
          fullText = sentences.slice(1).join('. ') + (sentences.length > 1 ? '.' : '');

          try {
            setAgentState(session, 'speaking');
            
            for await (const audioChunk of streamTTS(sentenceToSpeak, session.abortController?.signal)) {
              if (session.abortController?.signal.aborted) {
                return;
              }

              if (session.audioBufferSize + audioChunk.length > 32768) {
                await new Promise(resolve => setTimeout(resolve, 100));
              }

              session.audioBuffer.push(audioChunk);
              session.audioBufferSize += audioChunk.length;
              sendEvent(session.ws, { type: 'agent_audio', audio: audioChunk.toString('base64') });
            }
          } catch {
            // TTS error, continue
          }
        }
      },
      session.abortController.signal
    );

    if (fullText.trim().length > 0 && !session.abortController.signal.aborted) {
      sendEvent(session.ws, { type: 'agent_state', state: 'speaking' as AgentState });
      
      for await (const audioChunk of streamTTS(fullText.trim(), session.abortController?.signal)) {
        if (session.abortController?.signal.aborted) {
          return;
        }

        if (session.audioBufferSize + audioChunk.length > 32768) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        session.audioBuffer.push(audioChunk);
        session.audioBufferSize += audioChunk.length;
        sendEvent(session.ws, { type: 'agent_audio', audio: audioChunk.toString('base64') });
      }
    }

    setAgentState(session, 'idle');
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      sendEvent(session.ws, { type: 'error', message: error.message });
    }
  } finally {
    session.processingLock = false;
    session.abortController = null;

    if (session.pendingTurns.length > 0) {
      const nextTurn = session.pendingTurns.shift();
      if (nextTurn) {
        processTurn(session, nextTurn.text);
      }
    }
  }
}

function handleBargeIn(session: VoiceSession): void {
  if (session.abortController) {
    session.abortController.abort();
    session.abortController = null;
  }
  session.audioBuffer = [];
  session.audioBufferSize = 0;
}

function handleWebSocketConnection(ws: WebSocket): void {
  const deepgramApiKey = env.DEEPGRAM_API_KEY;

  if (!deepgramApiKey) {
    sendEvent(ws, { type: 'error', message: 'DEEPGRAM_API_KEY is not configured' });
    ws.close();
    return;
  }

  const session: VoiceSession = {
    ws,
    deepgram: null as unknown as VoiceSession['deepgram'],
    processingLock: false,
    pendingTurns: [],
    interimTranscript: '',
    abortController: null,
    audioBuffer: [],
    audioBufferSize: 0,
    agentState: 'idle',
  };

  session.deepgram = CreateDeepgramConnection({
    apiKey: deepgramApiKey,
    onTranscript: (result) => {
      sendEvent(ws, { type: 'transcript', text: result.text, isFinal: result.isFinal });

      if (result.isFinal) {
        handleBargeIn(session);

        const text = result.text.trim();
        if (text.length > 0) {
          if (session.processingLock) {
            session.pendingTurns.push({ text });
          } else {
            processTurn(session, text);
          }
        }
      } else {
        session.interimTranscript = result.text;
      }
    },
    onError: (message) => {
      sendEvent(ws, { type: 'error', message });
    },
  });

  setAgentState(session, 'listening');

  ws.on('message', (data: Buffer, isBinary: boolean) => {
    if (!isBinary || data.length < 1) {
      return;
    }

    const messageType = data[0];
    const payload = data.slice(1);

    switch (messageType) {
      case 0x01: {
        try {
          const json = JSON.parse(payload.toString());
          if (json.type === 'audio' && typeof json.data === 'string') {
            if (session.agentState !== 'speaking') {
              const audioBuffer = Buffer.from(json.data, 'base64');
              session.deepgram.sendAudio(audioBuffer);
            }
          }
        } catch {
          // Invalid message format
        }
        break;
      }
      case 0x02: {
        session.interimTranscript = '';
        break;
      }
    }
  });

  ws.on('close', () => {
    handleBargeIn(session);
    session.deepgram.close();
  });

  ws.on('error', () => {
    handleBargeIn(session);
    session.deepgram.close();
  });
}

async function main(): Promise<void> {
  await app.prepare();

  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url || '', true);
    await handle(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url || '', true);

    if (pathname === '/api/voice' && request.method === 'GET') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, request) => {
    if (request.url?.startsWith('/api/voice')) {
      handleWebSocketConnection(ws);
    } else {
      ws.close();
    }
  });

  const activeConnections = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    activeConnections.add(ws);
    ws.on('close', () => {
      activeConnections.delete(ws);
    });
  });

  const shutdown = (): void => {
    console.log('Shutting down...');

    activeConnections.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });

    wss.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });

    setTimeout(() => {
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
