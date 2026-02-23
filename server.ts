import next from 'next';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });
import { createServer } from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { env } from '@/lib/env';
import createDeepgramConnection from '@/lib/voice/deepgramSTT';
import runVoiceAgent from '@/lib/voice/agentBridge';
import { streamTTS, createChunkIterator } from '@/lib/voice/ttsStream';
import type { AgentOutput, AgentState, VoiceEvent } from '@/lib/voice/voiceTypes';

const DEV = process.env.NODE_ENV !== 'production';
const HOSTNAME = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);
const MAX_WS_CONNECTIONS = 100;

const app = next({ dev: DEV, hostname: HOSTNAME, port: PORT });
const handler = app.getRequestHandler();

interface PendingTurn {
  text: string;
  timestamp: number;
}

interface VoiceSession {
  ws: WebSocket;
  dgReady: boolean;
  processingLock: boolean;
  pendingTurns: PendingTurn[];
  interimTranscript: string;
  ttsAbort: AbortController | null;
  agentAbort: AbortController | null;
  threadId: string;
  agentState: AgentState;
  idleTimer: ReturnType<typeof setTimeout> | null;
  encouragementTimer: ReturnType<typeof setTimeout> | null;
  agentChunks: AgentOutput[];
  agentChunksDone: { value: boolean };
}

const sessions = new Map<WebSocket, VoiceSession>();

function sendEvent(ws: WebSocket, event: VoiceEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(event));
    } catch {
      // Socket closed between check and send
    }
  }
}

function setAgentState(session: VoiceSession, state: AgentState): void {
  session.agentState = state;
  sendEvent(session.ws, { type: 'agent_state', state });
}

function clearTimers(session: VoiceSession): void {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }
  if (session.encouragementTimer) {
    clearTimeout(session.encouragementTimer);
    session.encouragementTimer = null;
  }
}

function startIdleTimer(session: VoiceSession): void {
  clearTimers(session);
  session.idleTimer = setTimeout(() => {
    if (session.agentState === 'listening') {
      session.pendingTurns.push({ text: 'Are you still there?', timestamp: Date.now() });
      if (!session.processingLock && session.pendingTurns.length > 0) {
        processNextTurn(session).catch((err) => console.error('processNextTurn error:', err));
      }
    }
  }, env.VOICE_IDLE_TIMEOUT_MS);
}

function startEncouragementTimer(session: VoiceSession): void {
  session.encouragementTimer = setTimeout(() => {
    sendEvent(session.ws, { type: 'transcript', text: 'Let me look that up...', isFinal: true });
  }, env.VOICE_ENCOURAGEMENT_MS);
}

async function consumeTurn(session: VoiceSession, turn: { text: string; timestamp: number }): Promise<void> {
  session.ttsAbort = null;
  session.agentAbort = new AbortController();
  session.agentChunks = [];
  session.agentChunksDone = { value: false };
  let ttsPromise: Promise<void> | null = null;

  setAgentState(session, 'thinking');
  startEncouragementTimer(session);

  try {
    for await (const chunk of runVoiceAgent(turn.text, session.threadId, session.agentAbort.signal)) {
      if (chunk.type === 'agent_chunk') {
        session.agentChunks.push({ type: 'agent_chunk', text: chunk.text });
        sendEvent(session.ws, { type: 'transcript', text: chunk.text, isFinal: false });
        
        if (!session.ttsAbort && session.agentChunks.length > 0) {
          session.ttsAbort = new AbortController();
          setAgentState(session, 'speaking');
          clearTimers(session);
          ttsPromise = streamTTS(
            createChunkIterator(session.agentChunks, session.ttsAbort.signal, session.agentChunksDone),
            session.ttsAbort.signal,
            session.ws
          );
        }
      } else if (chunk.type === 'agent_done') {
        session.agentChunks.push({ type: 'agent_done' });
        session.agentChunksDone.value = true;
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      sendEvent(session.ws, { type: 'error', message: 'Agent error' });
    }
  } finally {
    if (ttsPromise) {
      try {
        await ttsPromise;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('TTS error:', err);
        }
      }
    }
    session.agentAbort = null;
    setAgentState(session, 'listening');
    startIdleTimer(session);
  }
}

async function processNextTurn(session: VoiceSession): Promise<void> {
  if (session.processingLock || session.pendingTurns.length === 0) return;

  session.processingLock = true;

  try {
    while (session.pendingTurns.length > 0) {
      const turn = session.pendingTurns.shift()!;
      await consumeTurn(session, turn);
    }
  } finally {
    session.processingLock = false;
  }
}

function handleBargeIn(session: VoiceSession): void {
  if (session.agentAbort) {
    session.agentAbort.abort();
    session.agentAbort = null;
  }
  if (session.ttsAbort) {
    session.ttsAbort.abort();
    session.ttsAbort = null;
  }
  session.agentChunks = [];
  session.agentChunksDone = { value: false };
}

async function main() {
  await app.prepare();
  const server = createServer(async (req, res) => {
    const parsedUrl = parse(req.url!, true);
    await handler(req, res, parsedUrl);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url!, true);
    if (pathname === '/api/voice') {
      const origin = req.headers.origin;
      const allowedOrigins = DEV
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : [process.env.NEXT_PUBLIC_APP_URL].filter(Boolean);
      
      if (!DEV && allowedOrigins.length === 0) {
        socket.destroy();
        return;
      }
      
      if (!DEV && !origin) {
        socket.destroy();
        return;
      }
      
      if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
        socket.destroy();
        return;
      }
      
      if (wss.clients.size >= MAX_WS_CONNECTIONS) {
        socket.destroy();
        return;
      }
      
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    const session: VoiceSession = {
      ws,
      dgReady: false,
      processingLock: false,
      pendingTurns: [],
      interimTranscript: '',
      ttsAbort: null,
      agentAbort: null,
      threadId: nanoid(),
      agentState: 'idle',
      idleTimer: null,
      encouragementTimer: null,
      agentChunks: [],
      agentChunksDone: { value: false },
    };
    sessions.set(ws, session);

    if (!env.DEEPGRAM_API_KEY) {
      sendEvent(ws, { type: 'error', message: 'DEEPGRAM_API_KEY is not configured' });
      ws.close();
      return;
    }

    const dg = createDeepgramConnection({
      apiKey: env.DEEPGRAM_API_KEY,
      onSpeechStart: () => {
        clearTimers(session);
        handleBargeIn(session);
      },
      onInterim: (text: string) => {
        session.interimTranscript = text;
        sendEvent(ws, { type: 'transcript', text, isFinal: false });
      },
      onUtteranceEnd: (text: string) => {
        session.pendingTurns.push({ text, timestamp: Date.now() });
        if (!session.processingLock) {
          processNextTurn(session).catch((err) => console.error('processNextTurn error:', err));
        }
      },
      onSpeechEnd: () => {
        startIdleTimer(session);
      },
      onError: (msg: string) => {
        sendEvent(ws, { type: 'error', message: msg });
      },
      onReady: () => {
        session.dgReady = true;
        setAgentState(session, 'listening');
        sendEvent(ws, { type: 'transcript', text: 'Hi! How can I help you today?', isFinal: true });
        startIdleTimer(session);
      },
      onClose: () => {
        sendEvent(ws, { type: 'error', message: 'Speech recognition connection lost' });
        ws.close();
      },
    });

    ws.on('message', (data) => {
      if (!session.dgReady || session.agentState === 'speaking') return;
      if (Buffer.isBuffer(data)) {
        if (data.length > 0 && data[0] === 0x01) {
          try {
            const payload = JSON.parse(data.slice(1).toString());
            if (payload.type === 'voice_config' && payload.voice) {
              console.log('Received voice_config:', payload.voice);
            }
          } catch {
            // Ignore malformed control frames
          }
        } else {
          dg.sendAudio(data);
        }
      }
    });

    ws.on('close', () => {
      dg.close();
      clearTimers(session);
      if (session.agentAbort) session.agentAbort.abort();
      if (session.ttsAbort) session.ttsAbort.abort();
      sessions.delete(ws);
    });
  });

  const shutdown = () => {
    const forceExit = setTimeout(() => {
      console.error('Forced exit: server.close() timed out');
      process.exit(1);
    }, 10000);

    for (const [ws, session] of sessions) {
      clearTimers(session);
      if (session.agentAbort) session.agentAbort.abort();
      if (session.ttsAbort) session.ttsAbort.abort();
      ws.close();
    }
    server.close(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(PORT, HOSTNAME, () => {
    console.log(`> Ready on http://${HOSTNAME}:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
