import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import next from 'next';
import { nanoid } from 'nanoid';
import { env } from '@/lib/env';
import createDeepgramConnection from './lib/voice/deepgramSTT';
import runVoiceAgent from './lib/voice/agentBridge';
import { streamTTS, createChunkIterator } from './lib/voice/ttsStream';
import type { AgentOutput, AgentState, VoiceEvent } from './lib/voice/voiceTypes';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
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
  threadId: string;
  agentState: AgentState;
  idleTimer: ReturnType<typeof setTimeout> | null;
  encouragementTimer: ReturnType<typeof setTimeout> | null;
  agentChunks: AgentOutput[];
}

const sessions = new Map<WebSocket, VoiceSession>();

function sendEvent(ws: WebSocket, event: VoiceEvent): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
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
      session.pendingTurns.push({ text: "Are you still there?", timestamp: Date.now() });
      if (!session.processingLock && session.pendingTurns.length > 0) {
        processNextTurn(session);
      }
    }
  }, env.VOICE_IDLE_TIMEOUT_MS);
}

function startEncouragementTimer(session: VoiceSession): void {
  session.encouragementTimer = setTimeout(() => {
    sendEvent(session.ws, { type: 'transcript', text: "Let me look that up...", isFinal: true });
  }, env.VOICE_ENCOURAGEMENT_MS);
}

async function processNextTurn(session: VoiceSession): Promise<void> {
  if (session.processingLock || session.pendingTurns.length === 0) return;

  const turn = session.pendingTurns.shift()!;
  session.processingLock = true;
  session.ttsAbort = null;
  session.agentChunks = [];

  setAgentState(session, 'thinking');
  startEncouragementTimer(session);

  try {
    const agentAbort = new AbortController();
    
    for await (const chunk of runVoiceAgent(turn.text, session.threadId, agentAbort.signal)) {
      if (chunk.type === 'agent_chunk') {
        session.agentChunks.push({ type: 'agent_chunk', text: chunk.text });
        sendEvent(session.ws, { type: 'transcript', text: chunk.text, isFinal: false });
        
        if (!session.ttsAbort && session.agentChunks.length > 0) {
          session.ttsAbort = new AbortController();
          setAgentState(session, 'speaking');
          clearTimers(session);
          void streamTTS(createChunkIterator(session.agentChunks, session.ttsAbort.signal), session.ttsAbort.signal, session.ws);
        }
      } else if (chunk.type === 'agent_done') {
        session.agentChunks.push({ type: 'agent_done' });
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      sendEvent(session.ws, { type: 'error', message: 'Agent error' });
    }
  } finally {
    session.processingLock = false;
    setAgentState(session, 'listening');
    startIdleTimer(session);
    
    if (session.pendingTurns.length > 0) {
      processNextTurn(session);
    }
  }
}

function handleBargeIn(session: VoiceSession): void {
  if (session.ttsAbort) {
    session.ttsAbort.abort();
    session.ttsAbort = null;
  }
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
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
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
      threadId: nanoid(),
      agentState: 'idle',
      idleTimer: null,
      encouragementTimer: null,
      agentChunks: [],
    };
    sessions.set(ws, session);

    const dg = createDeepgramConnection({
      apiKey: env.DEEPGRAM_API_KEY!,
      onSpeechStart: () => {
        clearTimers(session);
        handleBargeIn(session);
      },
      onInterim: (text) => {
        session.interimTranscript = text;
        sendEvent(ws, { type: 'transcript', text, isFinal: false });
      },
      onUtteranceEnd: (text) => {
        session.pendingTurns.push({ text, timestamp: Date.now() });
        if (!session.processingLock) {
          processNextTurn(session);
        }
      },
      onSpeechEnd: () => {
        startIdleTimer(session);
      },
      onError: (msg) => {
        sendEvent(ws, { type: 'error', message: msg });
      },
      onReady: () => {
        session.dgReady = true;
        setAgentState(session, 'listening');
        sendEvent(ws, { type: 'transcript', text: "Hi! How can I help you today?", isFinal: true });
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
        dg.sendAudio(data);
      }
    });

    ws.on('close', () => {
      dg.close();
      clearTimers(session);
      if (session.ttsAbort) session.ttsAbort.abort();
      sessions.delete(ws);
    });
  });

  const shutdown = () => {
    for (const [ws, session] of sessions) {
      clearTimers(session);
      if (session.ttsAbort) session.ttsAbort.abort();
      ws.close();
    }
    server.close(() => process.exit(0));
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
