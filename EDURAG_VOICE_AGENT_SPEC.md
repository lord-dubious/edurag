# EduRAG — Voice Agent Spec

> **Directly attributed to `lord-dubious/edurag` main branch.**
> Every file path, import, and pattern references the actual codebase.

---

## What the repo uses today (voice-relevant facts)

| Concern | Current implementation | File |
|---|---|---|
| LLM | Cerebras `gpt-oss-120b` via `@ai-sdk/openai` compat | `lib/providers.ts` → `CHAT_BASE_URL=https://api.cerebras.ai/v1` |
| Streaming | Vercel AI SDK `streamText` + `toUIMessageStreamResponse()` | `app/api/chat/route.ts` |
| Agent entry | `runAgent({ messages, threadId })` | `lib/agent/index.ts` |
| History | `getHistory(threadId)` + `appendMessage()` | `lib/conversation.ts` |
| Env validation | Zod schema, all vars go through `env` | `lib/env.ts` |
| FAQ tracking | `trackAndMaybeGenerateFaq(userText)` — fire and forget | `lib/faq-manager.ts` |
| No TTS today | — | — |
| No WebSocket today | All streaming is SSE | `app/api/crawl/route.ts` pattern |

**The chat LLM is Cerebras** — it has no `/v1/audio/speech` endpoint. Voice TTS therefore needs its own env vars (`VOICE_TTS_*`) pointing to a provider that does expose TTS — OpenAI by default, but swappable via `VOICE_TTS_BASE_URL`.

**Voice is a separate TTS voice from the chat UI.** The chat UI has no TTS today (pure text via AI Elements). When you do add chat TTS later, use a different voice (suggested: `alloy`) so students can instantly tell which mode they're in. Voice agent uses `nova` — clearer, more formal delivery for factual Q&A content.

---

## Architecture — The Sandwich, mapped to your code

```
Browser mic (PCM 16000Hz mono)
         │  WebSocket  ws://host/api/voice
         ▼
[STT]  Deepgram Nova-3
       createDGConnection() in lib/voice/deepgramSTT.ts
         │  SpeechStarted → barge-in
         │  Transcript (speech_final) → accumulate
         │  UtteranceEnd → send to agent
         ▼
[Agent]  runAgentForVoice() in lib/voice/agentBridge.ts
         calls runAgent() from lib/agent/index.ts (unchanged)
         same Cerebras model, same vector_search tool, same threadId
         getHistory() + appendMessage() from lib/conversation.ts
         ↓ textStream (Vercel AI SDK AsyncIterable)
         ▼
[TTS]  streamTTS() in lib/voice/ttsStream.ts
       new OpenAI({ baseURL: VOICE_TTS_BASE_URL })  ← NOT chatProvider
       sentence-chunked, response_format: 'pcm'
         │  raw PCM Uint8Array chunks
         ▼
Browser AudioContext (playback queue)
```

---

## 1. Extend `lib/env.ts`

Add alongside the existing `CHAT_*` and `EMBEDDING_*` blocks in the Zod schema:

```typescript
// lib/env.ts — add to envSchema object
DEEPGRAM_API_KEY: z.string().min(1),

// Voice TTS — separate from CHAT_BASE_URL (Cerebras has no TTS endpoint)
VOICE_TTS_API_KEY:  z.string().min(1),
VOICE_TTS_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
VOICE_TTS_MODEL:    z.string().default('tts-1'),
VOICE_TTS_VOICE:    z.string().default('nova'),

VOICE_ENCOURAGEMENT_MS: z.coerce.number().default(2500),
VOICE_IDLE_TIMEOUT_MS:  z.coerce.number().default(8000),
```

**.env.local additions:**
```bash
DEEPGRAM_API_KEY=

VOICE_TTS_API_KEY=           # OpenAI key (or your chosen TTS provider's key)
VOICE_TTS_BASE_URL=https://api.openai.com/v1   # swap for Cartesia, Groq, ElevenLabs
VOICE_TTS_MODEL=tts-1
VOICE_TTS_VOICE=nova         # distinct from chat — see voice note above
```

---

## 2. Add voice system prompt suffix to `lib/agent/prompts.ts`

The existing `AGENT_SYSTEM_PROMPT` uses markdown (headers, bold, bullets). TTS can't speak that. Add a suffix — the existing prompt and `runAgent()` stay unchanged:

```typescript
// lib/agent/prompts.ts — add below AGENT_SYSTEM_PROMPT

export const VOICE_SYSTEM_PROMPT_SUFFIX = `

## Voice Mode — override all formatting rules above
- Respond in short complete spoken sentences. No markdown, no bullet points, no headers.
- Never use asterisks, square brackets, backticks, or any special characters.
- Lead with the direct answer. Keep responses to 3 sentences or fewer for simple questions.
- For citations say "according to the admissions page" or "from the tuition information" — not URLs.
- Sound like a helpful advisor on the phone, not a chatbot typing a response.
`;
```

Then in `lib/agent/index.ts`, add an optional `voiceMode` flag to `AgentOptions` and append the suffix when set. `app/api/chat/route.ts` is not affected because it doesn't pass `voiceMode`.

---

## 3. New files

```
lib/voice/
  voiceTypes.ts       ← VoiceEvent union, AgentState
  deepgramSTT.ts      ← Deepgram connection factory
  agentBridge.ts      ← calls runAgent(), adapts textStream to voice events
  ttsStream.ts        ← OpenAI-compat TTS, sentence-chunked
server.ts             ← custom Next.js + ws server (project root)
components/voice/
  VoiceCall.tsx       ← browser mic + AudioContext + call UI
  CallOrb.tsx         ← animated state orb
```

---

## 4. `lib/voice/voiceTypes.ts`

```typescript
export type VoiceEvent =
  | { type: 'interim';         text: string }
  | { type: 'utterance_end';   transcript: string }
  | { type: 'thinking' }
  | { type: 'agent_chunk';     text: string }
  | { type: 'agent_done' }
  | { type: 'tts_interrupted' }
  | { type: 'tts_done' }
  | { type: 'error';           message: string };

export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';
```

---

## 5. `lib/voice/deepgramSTT.ts`

```typescript
import { createClient, LiveTranscriptionEvents, type LiveClient } from '@deepgram/sdk';
import { env } from '@/lib/env';

export interface STTCallbacks {
  onInterim:      (text: string) => void;
  onSpeechStart:  () => void;
  onUtteranceEnd: (transcript: string) => void;
  onSpeechEnd:    () => void;
}

export function createDGConnection(callbacks: STTCallbacks): LiveClient {
  const deepgram = createClient(env.DEEPGRAM_API_KEY);

  const conn = deepgram.listen.live({
    model:            'nova-3',
    language:         'en-US',
    smart_format:     true,
    interim_results:  true,
    endpointing:      300,          // 300ms silence → speech_final
    utterance_end_ms: '1200',       // 1.2s silence → full turn complete
    vad_events:       true,         // SpeechStarted + SpeechEnded
    encoding:         'linear16',
    sample_rate:      16000,
    channels:         1,
  });

  let pending = '';

  conn.on(LiveTranscriptionEvents.SpeechStarted, () => callbacks.onSpeechStart());

  conn.on(LiveTranscriptionEvents.Transcript, (data) => {
    const txt = data.channel.alternatives[0]?.transcript ?? '';
    if (!txt) return;
    if (!data.is_final) { callbacks.onInterim(txt); return; }
    if (data.speech_final) pending += ' ' + txt;
  });

  conn.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    const turn = pending.trim();
    pending = '';
    if (turn) callbacks.onUtteranceEnd(turn);
  });

  // SpeechEnded via vad_events — used for idle detection
  conn.on('SpeechEnded' as any, () => callbacks.onSpeechEnd());

  conn.on(LiveTranscriptionEvents.Error, (err) =>
    console.error('[Voice/Deepgram]', err));

  return conn;
}
```

---

## 6. `lib/voice/agentBridge.ts`

Calls `runAgent()` and `getHistory()` / `appendMessage()` identically to `app/api/chat/route.ts`. Only difference: reads `.textStream` instead of returning a Response.

```typescript
import { convertToCoreMessages } from 'ai';
import { runAgent }               from '@/lib/agent';          // lib/agent/index.ts — unchanged
import { getHistory, appendMessage } from '@/lib/conversation'; // lib/conversation.ts — unchanged
import { trackAndMaybeGenerateFaq }  from '@/lib/faq-manager'; // lib/faq-manager.ts — unchanged
import { VOICE_SYSTEM_PROMPT_SUFFIX } from '@/lib/agent/prompts';

export async function* runAgentForVoice(
  transcript: string,
  threadId:   string,
): AsyncGenerator<{ type: 'agent_chunk'; text: string } | { type: 'agent_done' }> {

  // Same non-blocking FAQ tracking as app/api/chat/route.ts line ~500
  trackAndMaybeGenerateFaq(transcript)
    .catch(err => console.error('[Voice/FAQ]', err));

  // Same history pattern as app/api/chat/route.ts lines ~505-510
  const history = await getHistory(threadId);
  const historyMessages = history.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const userMsg = convertToCoreMessages([{
    id:      crypto.randomUUID(),
    role:    'user' as const,
    parts:   [{ type: 'text' as const, text: transcript }],
    content: transcript,
  }]);

  // runAgent() from lib/agent/index.ts — same model, same tools, voice mode
  const result = runAgent({
    messages: [...historyMessages, ...userMsg],
    threadId,
    voiceMode: true,   // appends VOICE_SYSTEM_PROMPT_SUFFIX (add this flag to AgentOptions)
  });

  const stream = (await result).textStream;
  let fullResponse = '';

  for await (const chunk of stream) {
    fullResponse += chunk;
    yield { type: 'agent_chunk', text: chunk };
  }

  yield { type: 'agent_done' };

  // Same persistence as app/api/chat/route.ts lines ~517-521
  appendMessage(threadId, { role: 'user',      content: transcript,   timestamp: new Date() })
    .catch(console.error);
  appendMessage(threadId, { role: 'assistant', content: fullResponse, timestamp: new Date() })
    .catch(console.error);
}
```

---

## 7. `lib/voice/ttsStream.ts`

```typescript
import OpenAI from 'openai';
import { env } from '@/lib/env';

// Separate client — NOT chatProvider from lib/providers.ts
// Cerebras (CHAT_BASE_URL) has no /v1/audio/speech endpoint
const ttsClient = new OpenAI({
  apiKey:  env.VOICE_TTS_API_KEY,
  baseURL: env.VOICE_TTS_BASE_URL,
});

const SENTENCE_RE = /[.!?]\s/;
const MAX_BUFFER  = 120;

// Strip markdown that leaks through the agent response
function cleanForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .trim();
}

export async function* streamTTS(
  agentChunks: AsyncIterable<{ type: 'agent_chunk'; text: string } | { type: 'agent_done' }>,
  abort: AbortSignal,
): AsyncGenerator<Uint8Array> {
  let buffer = '';

  async function* flush(text: string): AsyncGenerator<Uint8Array> {
    const cleaned = cleanForSpeech(text);
    if (!cleaned || abort.aborted) return;

    const res = await ttsClient.audio.speech.create({
      model:           env.VOICE_TTS_MODEL,           // 'tts-1'
      voice:           env.VOICE_TTS_VOICE as any,    // 'nova'
      input:           cleaned,
      response_format: 'pcm',                         // raw for lowest latency
    }, { signal: abort });

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      if (abort.aborted) return;
      yield chunk;
    }
  }

  for await (const event of agentChunks) {
    if (abort.aborted) break;
    if (event.type === 'agent_chunk') {
      buffer += event.text;
      if (SENTENCE_RE.test(buffer) || buffer.length > MAX_BUFFER) {
        yield* flush(buffer);
        buffer = '';
      }
    }
    if (event.type === 'agent_done' && buffer.trim()) {
      yield* flush(buffer);
    }
  }
}
```

---

## 8. `server.ts` (project root)

Next.js App Router has no native WebSocket support. A custom server wraps Next.js with the `ws` package — same pattern used by many Next.js apps that need bidirectional streams.

```typescript
import { createServer }    from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import next                from 'next';
import { createDGConnection }  from '@/lib/voice/deepgramSTT';
import { runAgentForVoice }    from '@/lib/voice/agentBridge';
import { streamTTS }           from '@/lib/voice/ttsStream';
import { env }                 from '@/lib/env';
import { nanoid }              from 'nanoid';   // already in package.json

const dev    = process.env.NODE_ENV !== 'production';
const nextApp = next({ dev });
const handle  = nextApp.getRequestHandler();

await nextApp.prepare();

const server = createServer((req, res) => handle(req, res));
const wss    = new WebSocketServer({ server, path: '/api/voice' });

wss.on('connection', (ws: WebSocket) => {
  const threadId  = nanoid();
  let agentState  = 'listening' as 'idle' | 'listening' | 'thinking' | 'speaking';
  let ttsAbort:   AbortController | null = null;
  let idleTimer:  NodeJS.Timeout | null  = null;

  const send = (obj: object) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };

  function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (agentState === 'idle' || agentState === 'listening') {
        triggerSpeak("Still there? Feel free to ask me anything.");
      }
    }, env.VOICE_IDLE_TIMEOUT_MS);
  }

  async function triggerSpeak(text: string) {
    ttsAbort = new AbortController();
    agentState = 'speaking';
    const oneShot = (async function* () {
      yield { type: 'agent_chunk' as const, text };
      yield { type: 'agent_done'  as const };
    })();
    for await (const pcm of streamTTS(oneShot, ttsAbort.signal)) {
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
    }
    send({ type: 'tts_done' });
    agentState = 'idle';
    resetIdle();
  }

  const dg = createDGConnection({
    onInterim: (text)     => send({ type: 'interim', text }),

    onSpeechStart: () => {
      resetIdle();
      if (agentState === 'speaking') {
        ttsAbort?.abort();
        ttsAbort = null;
        send({ type: 'tts_interrupted' });
        agentState = 'listening';
      }
    },

    onUtteranceEnd: async (transcript) => {
      agentState = 'thinking';
      send({ type: 'thinking' });

      const enc = setTimeout(() => {
        if (agentState === 'thinking') {
          triggerSpeak("Let me look that up for you…").catch(console.error);
        }
      }, env.VOICE_ENCOURAGEMENT_MS);

      ttsAbort = new AbortController();
      let firstChunk = false;

      try {
        const agentGen = runAgentForVoice(transcript, threadId);
        const withFlag = (async function* () {
          for await (const ev of agentGen) {
            if (!firstChunk && ev.type === 'agent_chunk') {
              firstChunk = true;
              clearTimeout(enc);
              agentState = 'speaking';
            }
            yield ev;
          }
        })();

        for await (const pcm of streamTTS(withFlag, ttsAbort.signal)) {
          if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
        }
        send({ type: 'tts_done' });
      } catch (err) {
        clearTimeout(enc);
        console.error('[Voice/server]', err);
        send({ type: 'error', message: 'Something went wrong. Please try again.' });
      } finally {
        agentState = 'idle';
        resetIdle();
      }
    },

    onSpeechEnd: () => {
      resetIdle();
      if (agentState !== 'thinking' && agentState !== 'speaking') agentState = 'listening';
    },
  });

  ws.on('message', (data: Buffer) => {
    if (Buffer.isBuffer(data)) dg.send(data);
  });

  ws.on('close', () => {
    ttsAbort?.abort();
    if (idleTimer) clearTimeout(idleTimer);
    dg.requestClose();
  });

  // Greet on connect
  resetIdle();
  triggerSpeak(`Hello! I'm your ${env.NEXT_PUBLIC_APP_NAME} assistant. What would you like to know?`)
    .catch(console.error);
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`EduRAG ready on :${port}`));
```

**Update `package.json`:**
```json
{
  "scripts": {
    "dev":   "tsx server.ts",
    "start": "NODE_ENV=production tsx server.ts",
    "build": "next build"
  }
}
```

---

## 9. `components/voice/VoiceCall.tsx` (add to `components/chat/ChatInput.tsx` toolbar)

```tsx
'use client';
import { useRef, useState, useCallback } from 'react';
import { PhoneIcon, PhoneOffIcon } from 'lucide-react';

type CallState = 'idle' | 'listening' | 'thinking' | 'speaking';

export function VoiceCall() {
  const wsRef   = useRef<WebSocket | null>(null);
  const ctxRef  = useRef<AudioContext | null>(null);
  const [state,   setState]   = useState<CallState>('idle');
  const [interim, setInterim] = useState('');
  const [active,  setActive]  = useState(false);
  const queue   = useRef<ArrayBuffer[]>([]);
  const playing = useRef(false);

  function playNext(ctx: AudioContext) {
    if (playing.current || !queue.current.length) return;
    playing.current = true;
    const chunk = queue.current.shift()!;
    const pcm   = new Int16Array(chunk);
    const buf   = ctx.createBuffer(1, pcm.length, 16000);
    const data  = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => { playing.current = false; playNext(ctx); };
    src.start();
  }

  function stopAudio() {
    queue.current = [];
    playing.current = false;
  }

  const startCall = useCallback(async () => {
    const ctx = new AudioContext({ sampleRate: 16000 });
    ctxRef.current = ctx;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/voice`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        queue.current.push(e.data);
        playNext(ctx);
        return;
      }
      const msg = JSON.parse(e.data as string);
      if (msg.type === 'interim')         setInterim(msg.text);
      if (msg.type === 'thinking')        { setState('thinking'); setInterim(''); }
      if (msg.type === 'tts_done')        setState('listening');
      if (msg.type === 'tts_interrupted') { stopAudio(); setState('listening'); }
    };

    ws.onopen = async () => {
      setActive(true);
      setState('listening');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true, noiseSuppression: true }
      });
      const source    = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const f32 = e.inputBuffer.getChannelData(0);
        const i16 = new ArrayBuffer(f32.length * 2);
        const dv  = new DataView(i16);
        for (let i = 0; i < f32.length; i++) {
          const s = Math.max(-1, Math.min(1, f32[i]));
          dv.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        ws.send(i16);
      };
      source.connect(processor);
      processor.connect(ctx.destination);
    };
    ws.onclose = () => { setActive(false); setState('idle'); setInterim(''); };
  }, []);

  const endCall = useCallback(() => {
    wsRef.current?.close();
    ctxRef.current?.close();
    wsRef.current = null;
    ctxRef.current = null;
    stopAudio();
    setActive(false);
    setState('idle');
    setInterim('');
  }, []);

  return (
    <div>
      {active && (
        <div className="voice-panel">
          {/* CallOrb — animated circle showing current state */}
          <div className={`call-orb orb-${state}`} />
          {interim && <p className="voice-interim">{interim}</p>}
          <p className="voice-state">
            {state === 'listening' ? 'Listening…'
             : state === 'thinking' ? 'Looking that up…'
             : state === 'speaking' ? 'Speaking' : ''}
          </p>
        </div>
      )}
      {/* Add this button inside ChatInput.tsx's PromptInputTools */}
      <button onClick={active ? endCall : startCall} className="voice-btn">
        {active ? <PhoneOffIcon size={16} /> : <PhoneIcon size={16} />}
        {active ? 'End call' : 'Voice call'}
      </button>
    </div>
  );
}
```

---

## 10. Packages to install

```bash
npm install @deepgram/sdk ws openai
npm install -D @types/ws tsx
```

`openai` might already be in `package.json` as a peer dep. `tsx` replaces `ts-node` for the custom server. `nanoid` is already there.

---

## 11. Files NOT changed

`lib/agent/index.ts` — only adds `voiceMode?: boolean` to `AgentOptions` and one `if (voiceMode)` line
`lib/agent/tools.ts` — unchanged
`lib/agent/prompts.ts` — adds `VOICE_SYSTEM_PROMPT_SUFFIX` export only
`lib/vectorstore.ts` — unchanged
`lib/crawl.ts` — unchanged
`lib/conversation.ts` — unchanged (voice reuses it identically)
`lib/faq-manager.ts` — unchanged (voice reuses `trackAndMaybeGenerateFaq` identically)
`app/api/chat/route.ts` — unchanged
`middleware.ts` — unchanged
All admin routes — unchanged

---

## 12. Turn-taking summary

| Event | Source | What happens |
|---|---|---|
| `SpeechStarted` | Deepgram | If speaking → `ttsAbort.abort()`, send `tts_interrupted`, switch to listening |
| `Transcript` not final | Deepgram | Send `interim` to browser for live text display |
| `Transcript` `speech_final` | Deepgram | Accumulate into pending buffer |
| `UtteranceEnd` | Deepgram (1.2s silence) | Send buffer to `runAgentForVoice()` |
| Agent slow >2.5s | Server timer | TTS "Let me look that up for you…" |
| First agent token | Agent stream | Cancel timer, switch to speaking |
| `SpeechEnded` | Deepgram VAD | Reset 8s idle timer |
| 8s idle | Server timer | TTS "Still there? Feel free to ask me anything." |
| Browser close | WebSocket close | Abort TTS, close Deepgram, clear timers |

---

## 13. AI Elements — Voice Components

The repo already uses AI Elements extensively in the chat UI (`components/chat/`). All six voice components in the library apply directly to the voice agent. Install them the same way the chat components were installed.

```bash
npx ai-elements@latest add persona
npx ai-elements@latest add speech-input
npx ai-elements@latest add transcription
npx ai-elements@latest add audio-player
npx ai-elements@latest add mic-selector
npx ai-elements@latest add voice-selector
```

---

### 13.1 `Persona` — the animated call orb

Replaces the hand-rolled `CallOrb.tsx` from §8. This is the primary visual signal of the call state — a Rive WebGL2 animation that responds to `idle`, `listening`, `thinking`, `speaking`, and `asleep` states. It maps 1:1 to `agentState` from `stateMachine.ts`.

**Install:** `npx ai-elements@latest add persona`
**Import:** `import { Persona } from '@/components/ai-elements/persona'`

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `state` | `"idle" \| "listening" \| "thinking" \| "speaking" \| "asleep"` | Maps directly to `AgentState` from `lib/voice/voiceTypes.ts` |
| `variant` | `"obsidian" \| "mana" \| "opal" \| "halo" \| "glint" \| "command"` | Pick one that matches university branding |
| `className` | `string` | Size control — use `size-40` for the main call view |
| `onReady` | `() => void` | Fire when animation is loaded — good place to enable the start call button |

**Six variants available:** `obsidian` (dark, default), `mana` (blue-purple), `opal` (iridescent), `halo` (light ring), `glint` (minimal sparkle), `command` (terminal aesthetic). Recommend `opal` or `halo` for a university context — neutral and professional.

**How it replaces `CallOrb.tsx`:**

```tsx
// components/voice/VoiceCall.tsx — replace the hand-rolled orb div with:
import { Persona } from '@/components/ai-elements/persona';

// agentState from stateMachine maps directly — no translation needed
<Persona
  state={agentState}        // 'idle' | 'listening' | 'thinking' | 'speaking'
  variant="opal"
  className="size-40"
  onReady={() => setPersonaReady(true)}
/>
```

The `asleep` state maps to when the 8-second idle timer fires and the student hasn't spoken — set `agentState` to `'asleep'` (add it to `AgentState` in `voiceTypes.ts`) before playing the idle prompt, then restore to `'listening'` after.

---

### 13.2 `MicSelector` — device picker before the call starts

Lets students choose which microphone to use before starting a call. Built on shadcn/ui `Command` + `Popover` — same patterns as the rest of the UI. Handles `getUserMedia` permission requests, automatic device list refresh when devices are plugged in, and intelligent device name parsing (strips the "(Built-in)" clutter macOS adds).

**Install:** `npx ai-elements@latest add mic-selector`
**Import:** `import { MicSelector, ... } from '@/components/ai-elements/mic-selector'`

**Where it lives in EduRAG:** Add to `components/voice/VoiceCall.tsx` as a pre-call settings row, shown only when `!active`. When the student picks a device, store its `deviceId` and pass it to `getUserMedia`:

```tsx
import {
  MicSelector,
  MicSelectorTrigger,
  MicSelectorContent,
  MicSelectorItem,
} from '@/components/ai-elements/mic-selector';

const [micId, setMicId] = useState<string | undefined>();

// In the pre-call UI (active === false):
<MicSelector value={micId} onValueChange={setMicId}>
  <MicSelectorTrigger />
  <MicSelectorContent>
    <MicSelectorItem />   {/* auto-populates from enumerateDevices() */}
  </MicSelectorContent>
</MicSelector>

// Then in startCall():
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    deviceId: micId ? { exact: micId } : undefined,
    channelCount: 1,
    sampleRate: 16000,
    echoCancellation: true,
    noiseSuppression: true,
  }
});
```

---

### 13.3 `VoiceSelector` — let admins (or students) pick the TTS voice

Used in two places: the **admin dashboard** (to set `VOICE_TTS_VOICE` per deployment), and optionally as a **student preference** in the pre-call screen. Built on shadcn/ui `Dialog` + `Command` with a `VoiceSelectorPreview` button so users can hear a sample before choosing.

**Install:** `npx ai-elements@latest add voice-selector`
**Import:** `import { VoiceSelector, ... } from '@/components/ai-elements/voice-selector'`

**Key sub-components:**

| Sub-component | Purpose |
|---|---|
| `VoiceSelector` | Root — manages `value` + `open` state via context |
| `VoiceSelectorTrigger` | Button that opens the dialog |
| `VoiceSelectorContent` | Dialog shell with search |
| `VoiceSelectorInput` | Search box — filters by name, accent, gender |
| `VoiceSelectorList` + `VoiceSelectorGroup` | Scrollable list with optional grouping |
| `VoiceSelectorItem` | Selectable voice row |
| `VoiceSelectorName` | Styled voice name span |
| `VoiceSelectorAttributes` + `VoiceSelectorBullet` | Gender · Accent · Age metadata row |
| `VoiceSelectorGender` | Icon for male/female/non-binary/etc |
| `VoiceSelectorAccent` | Emoji flag for accent (american, british, australian…) |
| `VoiceSelectorPreview` | Play/pause button to audition the voice before selecting |
| `useVoiceSelector()` | Hook — access `{ value, setValue, open, setOpen }` from nested components |

**Usage in EduRAG — admin dashboard `components/admin/` settings:**

```tsx
import {
  VoiceSelector, VoiceSelectorTrigger, VoiceSelectorContent,
  VoiceSelectorInput, VoiceSelectorList, VoiceSelectorGroup,
  VoiceSelectorItem, VoiceSelectorName, VoiceSelectorAttributes,
  VoiceSelectorGender, VoiceSelectorAccent, VoiceSelectorBullet,
  VoiceSelectorPreview,
} from '@/components/ai-elements/voice-selector';

// OpenAI voices — populate this array from your TTS provider's voice list
const AVAILABLE_VOICES = [
  { id: 'nova',   name: 'Nova',   gender: 'female', accent: 'american' },
  { id: 'alloy',  name: 'Alloy',  gender: 'androgyne', accent: 'american' },
  { id: 'echo',   name: 'Echo',   gender: 'male',   accent: 'american' },
  { id: 'fable',  name: 'Fable',  gender: 'male',   accent: 'british' },
  { id: 'onyx',   name: 'Onyx',   gender: 'male',   accent: 'american' },
  { id: 'shimmer', name: 'Shimmer', gender: 'female', accent: 'american' },
];

export function VoiceAgentSettings() {
  const [voice, setVoice] = useState(env.NEXT_PUBLIC_VOICE_TTS_VOICE ?? 'nova');

  return (
    <VoiceSelector value={voice} onValueChange={setVoice}>
      <VoiceSelectorTrigger />
      <VoiceSelectorContent title="Select agent voice">
        <VoiceSelectorInput placeholder="Search voices…" />
        <VoiceSelectorList>
          <VoiceSelectorGroup heading="Available voices">
            {AVAILABLE_VOICES.map(v => (
              <VoiceSelectorItem key={v.id} value={v.id}>
                <VoiceSelectorPreview
                  onPlay={() => previewVoice(v.id)}
                />
                <VoiceSelectorName>{v.name}</VoiceSelectorName>
                <VoiceSelectorAttributes>
                  <VoiceSelectorGender value={v.gender as any} />
                  <VoiceSelectorBullet />
                  <VoiceSelectorAccent value={v.accent as any} />
                </VoiceSelectorAttributes>
              </VoiceSelectorItem>
            ))}
          </VoiceSelectorGroup>
        </VoiceSelectorList>
      </VoiceSelectorContent>
    </VoiceSelector>
  );
}
```

---

### 13.4 `Transcription` — synced live transcript during the call

Displays the full conversation transcript with the current segment highlighted in sync with TTS playback. Supports click-to-seek so students can jump back to any point in what the agent said. Uses a render-props interface so you control the layout.

**Install:** `npx ai-elements@latest add transcription`
**Import:** `import { Transcription } from '@/components/ai-elements/transcription'`

**What it does:** Takes `segments` (word/phrase array with timestamps), `currentTime` (audio playback position), and an `onSeek` callback. Highlights the active segment using DOM refs rather than React state re-renders — performant even at 60Hz.

**How it fits into the call UI:** The transcript panel sits below the `Persona` orb in `VoiceCall.tsx`. Build up `segments` as `UtteranceEnd` events arrive — each turn from the student and each full response from the agent becomes a segment. `currentTime` comes from the `AudioContext` playback clock.

```tsx
import { Transcription } from '@/components/ai-elements/transcription';

// Accumulate turns as segments
interface Segment {
  id:       string;
  text:     string;
  start:    number;   // seconds from call start
  end:      number;
  speaker:  'student' | 'agent';
}

const [segments, setSegments] = useState<Segment[]>([]);
const [currentTime, setCurrentTime] = useState(0);

// Update currentTime from AudioContext clock during TTS playback
// (requestAnimationFrame loop while agentState === 'speaking')

<Transcription
  segments={segments}
  currentTime={currentTime}
  onSeek={(time) => {
    // Seek audio playback — only applicable if replaying a recorded call.
    // In live call mode this is a no-op (can't seek live audio)
  }}
>
  {({ segment, isActive }) => (
    <p
      key={segment.id}
      className={`voice-segment voice-${segment.speaker} ${isActive ? 'voice-segment--active' : ''}`}
    >
      <span className="voice-speaker">
        {segment.speaker === 'student' ? 'You' : env.NEXT_PUBLIC_APP_NAME}
      </span>
      {segment.text}
    </p>
  )}
</Transcription>
```

---

### 13.5 `AudioPlayer` — post-call replay

Not used during a live call (the `AudioContext` handles live PCM playback directly). Used **after** the call ends if you save the session audio to a URL and want to let the student replay it — e.g. "Review this call" in the student dashboard.

**Install:** `npx ai-elements@latest add audio-player`
**Import:** `import { AudioPlayer, ... } from '@/components/ai-elements/audio-player'`

**What it provides:** Composable architecture built on `media-chrome`. Includes controls, metadata display, and seamless integration with AI-generated audio. Pair it with the `Transcription` component via shared `currentTime` state for a synchronized replay experience.

```tsx
// components/voice/CallReplay.tsx — shown after call ends if session was recorded
import { AudioPlayer } from '@/components/ai-elements/audio-player';
import { Transcription } from '@/components/ai-elements/transcription';

export function CallReplay({ audioUrl, segments }: { audioUrl: string; segments: Segment[] }) {
  const [currentTime, setCurrentTime] = useState(0);

  return (
    <div className="call-replay">
      <AudioPlayer
        src={audioUrl}
        onTimeUpdate={(time) => setCurrentTime(time)}
      />
      <Transcription
        segments={segments}
        currentTime={currentTime}
        onSeek={(time) => { /* seek AudioPlayer */ }}
      >
        {({ segment, isActive }) => (
          <p className={isActive ? 'font-medium' : 'text-muted-foreground'}>
            {segment.text}
          </p>
        )}
      </Transcription>
    </div>
  );
}
```

---

### 13.6 `SpeechInput` — chat UI mic button (separate from the voice call)

The existing `ChatInput.tsx` uses `PromptInputTools` / `PromptInputButton`. `SpeechInput` is the right AI Elements component to add a quick dictation button to the **text chat** — it transcribes what the student says and drops it into the `PromptInputTextarea`, without starting a full voice call session.

This is distinct from the voice agent. A student can:
- Click the **Voice call** button → starts the full bidirectional voice session (§8)
- Click the **Mic** button → `SpeechInput` dictates text into the chat box, no audio output

**Install:** `npx ai-elements@latest add speech-input`
**Import:** `import { SpeechInput } from '@/components/ai-elements/speech-input'`

**Integration in `components/chat/ChatInput.tsx`** — add inside the existing `PromptInputTools`:

```tsx
import { SpeechInput } from '@/components/ai-elements/speech-input';

// Inside <PromptInputTools>:
<SpeechInput
  onTranscriptionChange={(text) => {
    // Append transcribed text to the textarea input
    setInput(prev => prev ? `${prev} ${text}` : text);
  }}
  // Firefox/Safari fallback — send audio to Deepgram REST (not the live WS connection)
  onAudioRecorded={async (blob) => {
    const formData = new FormData();
    formData.append('audio', blob, 'audio.webm');
    const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
    const { text } = await res.json();
    return text;
  }}
  lang="en-US"
/>
```

For the `onAudioRecorded` fallback, add a thin `app/api/transcribe/route.ts` that POSTs the blob to Deepgram's REST API (not WebSocket — single-shot transcription is fine here).

---

### 13.7 Component map — what goes where

| AI Elements component | Location in EduRAG | When it renders |
|---|---|---|
| `Persona` | `components/voice/VoiceCall.tsx` | Always during an active call — state drives the animation |
| `MicSelector` | `components/voice/VoiceCall.tsx` | Pre-call setup screen (`!active`) |
| `VoiceSelector` | `components/admin/VoiceAgentSettings.tsx` | Admin dashboard — sets `VOICE_TTS_VOICE` |
| `Transcription` | `components/voice/VoiceCall.tsx` | During active call — live turn-by-turn log |
| `AudioPlayer` + `Transcription` | `components/voice/CallReplay.tsx` | Post-call, if session audio is saved |
| `SpeechInput` | `components/chat/ChatInput.tsx` | Chat UI dictation button (not voice call) |

---

### 13.8 Installation summary

```bash
# Voice agent components (new)
npx ai-elements@latest add persona
npx ai-elements@latest add mic-selector
npx ai-elements@latest add voice-selector
npx ai-elements@latest add transcription
npx ai-elements@latest add audio-player

# Chat UI dictation button (add to existing ChatInput)
npx ai-elements@latest add speech-input
```

The chat UI components (`message`, `conversation`, `prompt-input`, `inline-citation`, `confirmation`) are already installed per `EDURAG_ARCHITECTURE.md` §6. No changes needed to those.

---

## 14. Known Issues & Fixes

A systematic audit of the design above surfaces 15 real problems — ranging from silent audio bugs to race conditions and deployment blockers. Each is documented with root cause and exact fix.

---

### Issue 1 — `onUtteranceEnd` is async but Deepgram fires it synchronously

**Root cause:** `createDGConnection` registers callbacks but the caller's `onUtteranceEnd` is `async`. Deepgram fires it and immediately moves on. If a student speaks two short sentences back to back, two agent calls are inflight simultaneously — they race to `appendMessage`, interleave TTS audio, and corrupt conversation history.

**Fix — add a processing lock in `server.ts`:**

```typescript
// server.ts — add alongside agentState
let processingLock = false;

// Inside onUtteranceEnd:
onUtteranceEnd: async (transcript) => {
  if (processingLock) {
    // Student spoke during thinking — queue the new turn after current completes
    console.warn('[Voice] turn received while processing, queuing');
    // Simple approach: discard. Better: queue with a pendingTranscript buffer.
    // See Issue 6 for the full concurrent-turn solution.
    return;
  }
  processingLock = true;
  try {
    // ... existing body ...
  } finally {
    processingLock = false;
  }
},
```

---

### Issue 2 — Greeting TTS fires before Deepgram connection is ready

**Root cause:** `triggerSpeak(greeting)` is called at the bottom of the `wss.on('connection')` handler, while the Deepgram `listen.live()` connection is still opening its own WebSocket. Any mic audio sent in the first few hundred milliseconds gets dropped. Worse, if the student starts talking during the greeting, `SpeechStarted` may not fire because DG isn't fully connected yet.

**Fix — wait for Deepgram `Open` event before greeting and accepting mic audio:**

```typescript
// server.ts — replace the bottom of the connection handler

let dgReady = false;
const pendingAudio: Buffer[] = [];

dg.on(LiveTranscriptionEvents.Open, () => {
  dgReady = true;
  // Flush any mic audio that arrived before DG was ready
  for (const chunk of pendingAudio) dg.send(chunk);
  pendingAudio.length = 0;
  // Greet only after DG is ready to catch barge-in
  triggerSpeak(`Hello! I'm your ${env.NEXT_PUBLIC_APP_NAME} assistant. What would you like to know?`)
    .catch(console.error);
});

ws.on('message', (data: Buffer) => {
  if (!dgReady) { pendingAudio.push(data); return; }
  if (Buffer.isBuffer(data)) dg.send(data);
});
```

---

### Issue 3 — `stopAudio()` doesn't stop the currently playing `AudioBufferSourceNode`

**Root cause:** `stopAudio()` clears `queue.current` and resets `playing.current`, but the `AudioBufferSourceNode` that's already been `.start()`-ed keeps playing until its buffer runs out. On a barge-in, the student hears the tail of the agent's previous sentence over their own voice.

**Fix — track active source nodes and `stop()` them explicitly:**

```typescript
// components/voice/VoiceCall.tsx — replace queue/playing refs with:
const queue      = useRef<ArrayBuffer[]>([]);
const playing    = useRef(false);
const activeSrcs = useRef<AudioBufferSourceNode[]>([]);   // NEW

function playNext(ctx: AudioContext) {
  if (playing.current || !queue.current.length) return;
  playing.current = true;
  const chunk = queue.current.shift()!;
  const pcm = new Int16Array(chunk);
  const buf = ctx.createBuffer(1, pcm.length, 24000);   // see Issue 11 — 24kHz
  const data = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  activeSrcs.current.push(src);                          // track it
  src.onended = () => {
    activeSrcs.current = activeSrcs.current.filter(s => s !== src);
    playing.current = false;
    playNext(ctx);
  };
  src.start();
}

function stopAudio() {
  queue.current = [];
  playing.current = false;
  for (const src of activeSrcs.current) {
    try { src.stop(); } catch {}  // may already be stopped
  }
  activeSrcs.current = [];       // NEW — actually stops in-flight audio
}
```

---

### Issue 4 — `ScriptProcessorNode` is deprecated

**Root cause:** `createScriptProcessor` is deprecated in the Web Audio API spec (Chrome 113+ shows a console warning). It processes audio on the main thread, causing choppy mic capture under any UI load. It will eventually be removed.

**Fix — use `AudioWorkletNode` instead.** Add a tiny worklet file to `public/`:

```javascript
// public/pcm-processor.js
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (channel) this.port.postMessage(channel);   // Float32Array per 128-sample block
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
```

Then in `startCall()`:

```typescript
// components/voice/VoiceCall.tsx — replace ScriptProcessor setup

await ctx.audioWorklet.addModule('/pcm-processor.js');
const source    = ctx.createMediaStreamSource(stream);
const worklet   = new AudioWorkletNode(ctx, 'pcm-processor');

worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  const f32 = e.data;
  const i16 = new ArrayBuffer(f32.length * 2);
  const dv  = new DataView(i16);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    dv.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  ws.send(i16);
};

source.connect(worklet);
// Don't connect worklet to destination — we don't want to hear the mic input
```

---

### Issue 5 — Deepgram transcribes TTS speaker output (acoustic echo)

**Root cause:** The browser plays TTS audio through the speakers. The microphone picks it up. Deepgram transcribes the agent's own voice as if it were the student speaking. This triggers false `SpeechStarted` events and accumulates garbage in `pending` — leading to the agent responding to its own output.

`echoCancellation: true` in `getUserMedia` helps but is not guaranteed, especially on Windows with some USB headsets, or on mobile.

**Fix — gate `pending` accumulation on the server while `agentState === 'speaking'`:**

```typescript
// lib/voice/deepgramSTT.ts — update the Transcript handler

conn.on(LiveTranscriptionEvents.Transcript, (data) => {
  const txt = data.channel.alternatives[0]?.transcript ?? '';
  if (!txt) return;
  if (!data.is_final) { callbacks.onInterim(txt); return; }
  // Only accumulate when the agent is NOT speaking
  // The speaking flag is passed in from the server
  if (data.speech_final && callbacks.isSpeaking && !callbacks.isSpeaking()) {
    pending += ' ' + txt;
  }
});
```

Add `isSpeaking: () => boolean` to `STTCallbacks` and pass `() => agentState === 'speaking'` from `server.ts`. This doesn't discard the transcript event (it still fires `onInterim` for display) but prevents it from being sent to the agent.

---

### Issue 6 — Barge-in aborts TTS but `runAgentForVoice` generator keeps running

**Root cause:** `ttsAbort.abort()` stops the TTS stream from being sent to the browser, but `runAgentForVoice()` is an `async generator` that's still awaiting chunks from Cerebras. It will eventually finish and call `appendMessage()` with a partial response — polluting conversation history with a truncated assistant turn that the student never heard.

**Fix — pass the abort signal through to `runAgentForVoice` and check it before persisting:**

```typescript
// lib/voice/agentBridge.ts — add abortSignal parameter

export async function* runAgentForVoice(
  transcript:   string,
  threadId:     string,
  abortSignal?: AbortSignal,   // NEW
): AsyncGenerator<...> {
  // ...
  for await (const chunk of stream) {
    if (abortSignal?.aborted) {
      // Student interrupted — don't persist partial response
      console.log('[Voice/agent] interrupted, discarding partial response');
      return;
    }
    fullResponse += chunk;
    yield { type: 'agent_chunk', text: chunk };
  }

  yield { type: 'agent_done' };

  // Only persist if we completed normally (not interrupted)
  if (!abortSignal?.aborted) {
    appendMessage(threadId, { role: 'user', content: transcript, timestamp: new Date() })
      .catch(console.error);
    appendMessage(threadId, { role: 'assistant', content: fullResponse, timestamp: new Date() })
      .catch(console.error);
  }
}
```

Pass `ttsAbort.signal` when calling from `server.ts`:
```typescript
const agentGen = runAgentForVoice(transcript, threadId, ttsAbort.signal);
```

---

### Issue 7 — `ttsClient` instantiated at module load in `ttsStream.ts`

**Root cause:** `const ttsClient = new OpenAI({ apiKey: env.VOICE_TTS_API_KEY, ... })` runs when the module is first imported. If voice isn't configured yet (e.g., during the initial `npm run dev` before `.env.local` is filled in), this throws before any request is made, crashing the entire Next.js server.

**Fix — lazy-initialize:**

```typescript
// lib/voice/ttsStream.ts — replace top-level instantiation

let _ttsClient: OpenAI | null = null;
function getTTSClient(): OpenAI {
  if (!_ttsClient) {
    _ttsClient = new OpenAI({
      apiKey:  env.VOICE_TTS_API_KEY,
      baseURL: env.VOICE_TTS_BASE_URL,
    });
  }
  return _ttsClient;
}

// Then inside flush():
const res = await getTTSClient().audio.speech.create({ ... });
```

---

### Issue 8 — `server.ts` uses top-level `await` which requires ESM

**Root cause:** `await nextApp.prepare()` at the top level only works if `package.json` has `"type": "module"` or the file uses `.mts` extension with `tsx`'s ESM flag. The EduRAG repo is a standard Next.js project using CommonJS-style imports (`require` via tsc). Top-level await will throw `SyntaxError: await is only valid in async functions`.

**Fix — wrap everything in an async `main()`:**

```typescript
// server.ts — correct structure

import { createServer }      from 'http';
import { WebSocketServer }   from 'ws';
import next                  from 'next';
import { createDGConnection } from './lib/voice/deepgramSTT';
import { runAgentForVoice }   from './lib/voice/agentBridge';
import { streamTTS }          from './lib/voice/ttsStream';
import { env }                from './lib/env';
import { nanoid }             from 'nanoid';

async function main() {
  const dev     = process.env.NODE_ENV !== 'production';
  const nextApp = next({ dev });
  const handle  = nextApp.getRequestHandler();

  await nextApp.prepare();

  const server = createServer((req, res) => handle(req, res));
  const wss    = new WebSocketServer({ server, path: '/api/voice' });

  wss.on('connection', (ws) => { /* ... */ });

  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, () => console.log(`EduRAG ready on :${port}`));
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

Also update the import paths — use `./lib/...` not `@/lib/...` since `server.ts` is outside `app/` and the `@` alias is a Next.js/tsconfig alias that may not resolve in a raw `tsx` execution context. Add path aliases to `tsconfig.json`:

```json
// tsconfig.json — confirm this exists (it should already be there for Next.js)
{
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  }
}
```

And add a `tsconfig.server.json` if needed:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node"
  },
  "include": ["server.ts", "lib/**/*"]
}
```

---

### Issue 9 — `VOICE_TTS_API_KEY` required in `lib/env.ts` breaks app startup when voice is not yet configured

**Root cause:** The Zod schema marks `VOICE_TTS_API_KEY: z.string().min(1)` as required. `lib/env.ts` is imported at the top of many modules including `lib/providers.ts` and `lib/agent/index.ts`. If `VOICE_TTS_API_KEY` is missing, the entire app — including the chat UI — fails to start with a Zod validation error, even though voice is optional.

**Fix — make voice env vars optional at the schema level, validate lazily at call time:**

```typescript
// lib/env.ts — voice vars should be optional in schema

DEEPGRAM_API_KEY:       z.string().optional(),
VOICE_TTS_API_KEY:      z.string().optional(),
VOICE_TTS_BASE_URL:     z.string().url().default('https://api.openai.com/v1'),
VOICE_TTS_MODEL:        z.string().default('tts-1'),
VOICE_TTS_VOICE:        z.string().default('nova'),
VOICE_ENCOURAGEMENT_MS: z.coerce.number().default(2500),
VOICE_IDLE_TIMEOUT_MS:  z.coerce.number().default(8000),
```

Then in `server.ts`, validate before binding the WebSocket server:

```typescript
wss.on('connection', (ws) => {
  if (!env.DEEPGRAM_API_KEY || !env.VOICE_TTS_API_KEY) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Voice agent is not configured on this server.',
    }));
    ws.close();
    return;
  }
  // ... rest of handler
});
```

And in `VoiceCall.tsx`, disable the voice call button if a `NEXT_PUBLIC_VOICE_ENABLED` flag is false:
```typescript
// lib/env.ts — add
NEXT_PUBLIC_VOICE_ENABLED: z.coerce.boolean().default(false),
```

---

### Issue 10 — `middleware.ts` may intercept the `/api/voice` WebSocket upgrade

**Root cause:** EduRAG's `middleware.ts` applies auth checks to `/admin/*` and possibly all `/api/*` routes. The WebSocket upgrade for `/api/voice` arrives as a standard HTTP request before the upgrade handshake. If middleware returns a `401` or redirect for `/api/voice`, the WS connection never establishes — silently fails in the browser with `WebSocket is closed before the connection is established`.

**Fix — explicitly exclude `/api/voice` from middleware matching:**

```typescript
// middleware.ts — update the matcher config

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/(?!voice).*',   // all /api/* EXCEPT /api/voice
  ],
};
```

Or more explicitly if the existing matcher is different:
```typescript
export const config = {
  matcher: [
    '/((?!api/voice|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

---

### Issue 11 — OpenAI TTS PCM is 24kHz but `AudioContext` is created at 16kHz

**Root cause:** OpenAI's `response_format: 'pcm'` returns raw 16-bit signed integer PCM at **24,000 Hz**. The browser `AudioContext` in `VoiceCall.tsx` is created with `sampleRate: 16000` (chosen to match Deepgram's input). Feeding 24kHz PCM samples into a 16kHz context causes audio to play at 24/16 = 1.5× speed — chipmunk-speed, unintelligible audio.

**Fix — use separate sample rates for input (mic → Deepgram) and output (TTS → speaker):**

```typescript
// components/voice/VoiceCall.tsx — use two AudioContext instances

const micCtxRef = useRef<AudioContext | null>(null);   // 16kHz for mic capture
const spkCtxRef = useRef<AudioContext | null>(null);   // 24kHz for TTS playback

const startCall = useCallback(async () => {
  const micCtx = new AudioContext({ sampleRate: 16000 });  // mic → Deepgram
  const spkCtx = new AudioContext({ sampleRate: 24000 });  // TTS PCM playback
  micCtxRef.current = micCtx;
  spkCtxRef.current = spkCtx;
  // ...

  // Use micCtx for mic capture (ScriptProcessor / AudioWorklet)
  // Use spkCtx for TTS playback (createBuffer with sampleRate: 24000)
}, []);
```

And update `playNext` to use `spkCtxRef.current` and `createBuffer(1, pcm.length, 24000)`.

Also update `endCall` and cleanup to close both contexts:
```typescript
micCtxRef.current?.close();
spkCtxRef.current?.close();
```

---

### Issue 12 — `ttsAbort` race condition between `onSpeechStart` and `onUtteranceEnd`

**Root cause:** Consider this sequence:
1. Agent is speaking. Student starts speaking → `onSpeechStart` fires → `ttsAbort.abort()`, `ttsAbort = null`, `agentState = 'listening'`
2. Student finishes speaking quickly → `onUtteranceEnd` fires immediately
3. `onUtteranceEnd` creates `ttsAbort = new AbortController()` and calls `runAgentForVoice`
4. Another `onSpeechStart` fires (student is still speaking) → `ttsAbort?.abort()` on the new controller — kills the new agent call instantly

The second barge-in correctly kills the *new* agent call, but the student's second utterance is lost.

**Fix — only create a new `ttsAbort` immediately before the TTS starts streaming, not when the utterance ends:**

```typescript
// server.ts — restructure onUtteranceEnd

onUtteranceEnd: async (transcript) => {
  if (processingLock) return;  // from Issue 1
  processingLock = true;
  agentState = 'thinking';
  send({ type: 'thinking' });

  const thisAbort = new AbortController();
  // Don't assign to ttsAbort yet — barge-in during thinking is OK to discard

  const enc = setTimeout(() => {
    if (agentState === 'thinking' && !thisAbort.signal.aborted) {
      triggerSpeak("Let me look that up for you…").catch(console.error);
    }
  }, env.VOICE_ENCOURAGEMENT_MS);

  try {
    const agentGen = runAgentForVoice(transcript, threadId, thisAbort.signal);
    let firstChunk = false;

    const withFlag = (async function* () {
      for await (const ev of agentGen) {
        if (!firstChunk && ev.type === 'agent_chunk') {
          firstChunk = true;
          clearTimeout(enc);
          // NOW assign to ttsAbort — barge-in from here will abort correctly
          ttsAbort = thisAbort;
          agentState = 'speaking';
        }
        yield ev;
      }
    })();

    for await (const pcm of streamTTS(withFlag, thisAbort.signal)) {
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
    }
    if (!thisAbort.signal.aborted) send({ type: 'tts_done' });
  } catch (err) {
    clearTimeout(enc);
    if (!thisAbort.signal.aborted) {
      console.error('[Voice/server]', err);
      send({ type: 'error', message: 'Something went wrong. Please try again.' });
    }
  } finally {
    ttsAbort = null;
    agentState = 'idle';
    processingLock = false;
    resetIdle();
  }
},
```

---

### Issue 13 — `VOICE_SYSTEM_PROMPT_SUFFIX` itself uses markdown

**Root cause:** The suffix in `lib/agent/prompts.ts` is written with `##` headers and `-` bullet points. LLMs sometimes mirror the formatting style of their instructions. The suffix telling the model "don't use markdown" is itself written in markdown — conflicting signal.

**Fix — write the suffix in plain prose:**

```typescript
// lib/agent/prompts.ts — replace VOICE_SYSTEM_PROMPT_SUFFIX

export const VOICE_SYSTEM_PROMPT_SUFFIX = `

You are now responding by voice. Override the formatting rules above completely.
Speak in short complete sentences. Never use markdown characters: no asterisks, no hyphens as bullets, no pound signs, no backticks, no square brackets. Do not use numbered lists or bullet points.
Lead with the answer directly. Keep responses to three sentences or fewer for simple questions.
For citations, say the page name in plain speech: "according to the admissions page" or "from the tuition information" — never say a URL out loud.
Sound like a knowledgeable advisor on a phone call, not a chatbot composing a written response.
`;
```

---

### Issue 14 — `Transcription` segment timestamps are unavailable from `UtteranceEnd`

**Root cause:** The spec proposes building `Segment[]` from `UtteranceEnd` events, but `UtteranceEnd` only carries the text, not start/end timestamps. The `AudioContext` clock drifts from speech timing. Result: the `Transcription` component's highlight logic doesn't work correctly for live calls — `isActive` is always wrong.

**Fix — for live calls, don't use `currentTime`-based highlighting. Use a simpler "last segment is active" pattern instead:**

```tsx
// components/voice/VoiceCall.tsx — simplified live transcript

const [turns, setTurns] = useState<{ speaker: 'student' | 'agent'; text: string }[]>([]);

// Instead of <Transcription segments currentTime>, use a plain scrolling list:
// The Transcription component is better suited to post-call replay (§13.5)
// where actual timestamps from a recorded audio file are available.

<div className="voice-transcript" ref={transcriptRef}>
  {turns.map((turn, i) => (
    <div key={i} className={`voice-turn voice-turn--${turn.speaker} ${i === turns.length - 1 ? 'voice-turn--active' : ''}`}>
      <span className="voice-turn-speaker">
        {turn.speaker === 'student' ? 'You' : env.NEXT_PUBLIC_APP_NAME}
      </span>
      <span className="voice-turn-text">{turn.text}</span>
    </div>
  ))}
  {interim && <div className="voice-turn voice-turn--student voice-turn--interim">{interim}</div>}
</div>
```

Reserve `<Transcription>` for `CallReplay.tsx` (§13.5) where real timestamps from the saved audio file are available.

---

### Issue 15 — Deepgram WebSocket closes after 12s of inactivity

**Root cause:** Deepgram's live transcription WebSocket closes silently after approximately 12 seconds if no audio is sent. During a long idle period (student stepped away, or the encouragement idle timer hasn't fired yet), the connection drops. The next time the student speaks, there's no active Deepgram connection — their speech is never transcribed, but no error is visible.

**Fix — send Deepgram keepalives while the connection is open:**

```typescript
// lib/voice/deepgramSTT.ts — add keepalive inside createDGConnection

let keepaliveInterval: NodeJS.Timeout | null = null;

conn.on(LiveTranscriptionEvents.Open, () => {
  // Send keepalive every 8s (Deepgram closes after ~12s inactivity)
  keepaliveInterval = setInterval(() => {
    conn.keepAlive();
  }, 8000);
});

conn.on(LiveTranscriptionEvents.Close, () => {
  if (keepaliveInterval) clearInterval(keepaliveInterval);
});

conn.on(LiveTranscriptionEvents.Error, () => {
  if (keepaliveInterval) clearInterval(keepaliveInterval);
});

// Return a cleanup function alongside the connection
// Callers (server.ts ws.on('close')) should call cleanup()
```

Update the return type and `server.ts` cleanup:
```typescript
// server.ts
ws.on('close', () => {
  ttsAbort?.abort();
  if (idleTimer) clearTimeout(idleTimer);
  dg.requestClose();
  // keepalive is cleaned up inside deepgramSTT.ts on Close event
});
```

---

### Summary of issues and where each fix lives

| # | Issue | Severity | Fix location |
|---|---|---|---|
| 1 | Concurrent `onUtteranceEnd` calls | 🔴 High | `server.ts` — processing lock |
| 2 | Greeting fires before Deepgram is ready | 🟠 Medium | `server.ts` — wait for DG `Open` |
| 3 | `stopAudio()` doesn't stop playing nodes | 🔴 High | `VoiceCall.tsx` — track `AudioBufferSourceNode` refs |
| 4 | `ScriptProcessorNode` deprecated | 🟡 Low | `VoiceCall.tsx` + `public/pcm-processor.js` — `AudioWorkletNode` |
| 5 | Deepgram transcribes TTS speaker output | 🔴 High | `deepgramSTT.ts` — gate `pending` while `speaking` |
| 6 | Barge-in leaves partial `appendMessage` | 🟠 Medium | `agentBridge.ts` — pass abort signal, skip persist if aborted |
| 7 | `ttsClient` crashes on module load | 🟠 Medium | `ttsStream.ts` — lazy init |
| 8 | Top-level `await` in `server.ts` | 🔴 High | `server.ts` — wrap in `async main()` |
| 9 | Required voice env vars break chat on startup | 🔴 High | `lib/env.ts` — make voice vars optional |
| 10 | `middleware.ts` intercepts WS upgrade | 🟠 Medium | `middleware.ts` — exclude `/api/voice` from matcher |
| 11 | 24kHz TTS PCM played in 16kHz AudioContext | 🔴 High | `VoiceCall.tsx` — separate mic (16kHz) and speaker (24kHz) contexts |
| 12 | `ttsAbort` race on rapid barge-in | 🟠 Medium | `server.ts` — assign `ttsAbort` at first TTS chunk, not at utterance end |
| 13 | Voice prompt suffix uses markdown | 🟡 Low | `lib/agent/prompts.ts` — rewrite in plain prose |
| 14 | `Transcription` timestamps unavailable live | 🟡 Low | `VoiceCall.tsx` — plain turn list for live; `Transcription` for replay only |
| 15 | Deepgram WS closes after 12s inactivity | 🔴 High | `deepgramSTT.ts` — `keepAlive()` every 8s |

---

## 15. Second-Pass Issues & Fixes

A further audit of §14's own fixes and remaining overlooked areas surfaces 12 additional problems. Several are introduced directly by the §14 solutions.

---

### Issue 16 — Barge-in during `thinking` state is silently ignored

**Root cause (introduced by Issue 12 fix):** `onSpeechStart` only aborts when `agentState === 'speaking'`. The Issue 12 fix defers assigning `ttsAbort` until the first TTS chunk, so during the `thinking` phase `ttsAbort` is `null` and the barge-in guard has nothing to abort. The agent keeps running through its full Cerebras request and will start speaking even though the student has already started talking again.

**Fix — abort `thisAbort` on `SpeechStarted` during thinking too, and expose it so `onSpeechStart` can reach it:**

```typescript
// server.ts — replace onSpeechStart and restructure the abort controllers

// Shared ref visible to both onSpeechStart and onUtteranceEnd
let currentAbort: AbortController | null = null;

onSpeechStart: () => {
  resetIdle();
  if (agentState === 'speaking' || agentState === 'thinking') {
    currentAbort?.abort();       // kills thinking OR speaking
    currentAbort = null;
    ttsAbort = null;
    if (agentState === 'speaking') send({ type: 'tts_interrupted' });
    agentState = 'listening';
    processingLock = false;      // release lock so next utterance is accepted
  }
},

// Inside onUtteranceEnd:
const thisAbort = new AbortController();
currentAbort = thisAbort;        // onSpeechStart can now reach this
```

This means a barge-in during thinking correctly cancels the in-flight Cerebras request (via `abortSignal` passed to `runAgentForVoice` per Issue 6), releases the processing lock, and lets the student's new utterance be processed immediately.

---

### Issue 17 — `processingLock` discards barge-in utterances with no feedback

**Root cause (introduced by Issue 1 fix):** When the student interrupts mid-response and speaks a new question, `processingLock` is still `true` from the previous turn. The new `onUtteranceEnd` returns immediately — the student's question is silently dropped. From the student's perspective the agent just ignores them.

**Fix — use a pending queue instead of a hard discard, and send visual feedback:**

```typescript
// server.ts — replace the processingLock early-return

let pendingTurn: string | null = null;

onUtteranceEnd: async (transcript) => {
  if (processingLock) {
    pendingTurn = transcript;  // store most recent — older ones are superseded
    return;
  }
  await processTurn(transcript);
},

async function processTurn(transcript: string) {
  processingLock = true;
  try {
    // ... existing agent + TTS pipeline ...
  } finally {
    processingLock = false;
    // Process any queued turn that arrived during this one
    if (pendingTurn) {
      const next = pendingTurn;
      pendingTurn = null;
      await processTurn(next);
    }
  }
}
```

This ensures the most recent thing the student said always gets answered, even if it arrived while the lock was held.

---

### Issue 18 — `AudioWorklet` sends 125 WebSocket messages/second

**Root cause (introduced by Issue 4 fix):** `AudioWorkletProcessor` fires `process()` every 128 samples. At 16kHz that's every 8ms — approximately 125 messages per second to Deepgram. The original `ScriptProcessorNode` with `bufferSize: 4096` sent one message every 256ms (about 4/sec). This is a ~30× increase in WebSocket message frequency, adding unnecessary CPU and network overhead.

**Fix — accumulate worklet output into a larger buffer before sending:**

```javascript
// public/pcm-processor.js — buffer to ~256ms before posting
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._offset = 0;
  }
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    this._buffer.set(channel, this._offset);
    this._offset += channel.length;
    if (this._offset >= 4096) {
      this.port.postMessage(this._buffer.slice(0, this._offset));
      this._offset = 0;
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
```

This keeps the same ~256ms batching cadence as the original ScriptProcessor while still running off the main thread.

---

### Issue 19 — `getTTSClient()` caches a client with `undefined` API key

**Root cause (introduced by Issue 7 fix):** `getTTSClient()` sets `_ttsClient` on first call. If called when `env.VOICE_TTS_API_KEY` is `undefined` (valid since Issue 9 made it optional), it creates and permanently caches `new OpenAI({ apiKey: undefined })`. Every subsequent TTS call uses this broken client and fails with a 401, but the error message says "invalid API key" rather than "voice not configured" — confusing to debug.

**Fix — guard the cache setter:**

```typescript
// lib/voice/ttsStream.ts

function getTTSClient(): OpenAI {
  if (!env.VOICE_TTS_API_KEY) {
    throw new Error('[Voice] VOICE_TTS_API_KEY is not set — voice agent is not configured');
  }
  if (!_ttsClient) {
    _ttsClient = new OpenAI({
      apiKey:  env.VOICE_TTS_API_KEY,
      baseURL: env.VOICE_TTS_BASE_URL,
    });
  }
  return _ttsClient;
}
```

The error is caught by `server.ts`'s `try/catch` in `onUtteranceEnd`, which sends `{ type: 'error', message: '...' }` to the browser — clear feedback rather than a silent 401.

---

### Issue 20 — `triggerSpeak()` for encouragement races with `thisAbort`

**Root cause:** `triggerSpeak()` creates its own `ttsAbort = new AbortController()` and sets `agentState = 'speaking'`. If the encouragement timer fires while `onUtteranceEnd` is still awaiting the agent stream, there are now two concurrent TTS calls sharing the same `ttsAbort` reference. When the real agent response starts and reassigns `ttsAbort = thisAbort`, the encouragement TTS is orphaned — no one will abort it on barge-in, and `tts_done` fires at the wrong time.

**Fix — pass `thisAbort` into `triggerSpeak` so encouragement TTS is cancelled by the same signal as the main response:**

```typescript
// server.ts — change triggerSpeak signature

async function triggerSpeak(text: string, abort: AbortController) {
  abort.signal.throwIfAborted();   // don't start if already cancelled
  agentState = 'speaking';
  const oneShot = (async function* () {
    yield { type: 'agent_chunk' as const, text };
    yield { type: 'agent_done'  as const };
  })();
  for await (const pcm of streamTTS(oneShot, abort.signal)) {
    if (abort.signal.aborted) break;
    if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
  }
  if (!abort.signal.aborted) {
    send({ type: 'tts_done' });
    agentState = 'idle';
    resetIdle();
  }
}

// In onUtteranceEnd, pass thisAbort:
const enc = setTimeout(() => {
  if (agentState === 'thinking' && !thisAbort.signal.aborted) {
    triggerSpeak("Let me look that up for you…", thisAbort).catch(console.error);
  }
}, env.VOICE_ENCOURAGEMENT_MS);
```

---

### Issue 21 — `VoiceAgentSettings` reads `env.NEXT_PUBLIC_VOICE_TTS_VOICE` which doesn't exist

**Root cause:** `§13.3` uses `env.NEXT_PUBLIC_VOICE_TTS_VOICE` as the default value, but the env schema only defines `VOICE_TTS_VOICE` (server-side, not `NEXT_PUBLIC_`). Client components can't access server-only env vars directly. The admin settings component will get `undefined` and silently default to no selection.

**Fix — add the public-facing version to `lib/env.ts` and use it in the component:**

```typescript
// lib/env.ts — add alongside VOICE_TTS_VOICE
NEXT_PUBLIC_VOICE_TTS_VOICE: z.string().default('nova'),
```

`.env.local`:
```bash
NEXT_PUBLIC_VOICE_TTS_VOICE=nova   # exposed to browser for UI default
VOICE_TTS_VOICE=nova               # used server-side in ttsStream.ts
```

And update `VoiceAgentSettings`:
```tsx
// components/admin/VoiceAgentSettings.tsx
import { env } from '@/lib/env';  // this is the public-safe subset

const [voice, setVoice] = useState(
  process.env.NEXT_PUBLIC_VOICE_TTS_VOICE ?? 'nova'
);
// Note: read directly from process.env in client components,
// not from lib/env.ts (which uses server-only process.env at build time)
```

---

### Issue 22 — `server.ts` code block still uses `@/lib/...` imports after Issue 8 fix

**Root cause:** Issue 8's fix text says "use `./lib/...` not `@/lib/...`" in prose, but the corrected code block at the top of the fix still has `@/` paths:

```typescript
import { createDGConnection } from '@/lib/voice/deepgramSTT';  // ← still wrong
```

`tsx` doesn't resolve Next.js path aliases unless explicitly configured with `tsconfig-paths`. Without that, `@/lib/...` throws `Cannot find module '@/lib/...'` at runtime.

**Fix — either use relative paths or register `tsconfig-paths`:**

Option A — relative paths (simplest):
```typescript
// server.ts — use relative paths throughout
import { createDGConnection } from './lib/voice/deepgramSTT';
import { runAgentForVoice }   from './lib/voice/agentBridge';
import { streamTTS }          from './lib/voice/ttsStream';
import { env }                from './lib/env';
```

Option B — register `tsconfig-paths` so `@/` works in `tsx`:
```bash
npm install -D tsconfig-paths
```
```json
// package.json scripts
"dev":   "tsx -r tsconfig-paths/register server.ts",
"start": "NODE_ENV=production tsx -r tsconfig-paths/register server.ts"
```

Option A is less brittle and recommended.

---

### Issue 23 — `ws` `message` event misses `ArrayBuffer` and `Buffer[]` RawData types

**Root cause:** The `ws` package types `message` event data as `RawData = Buffer | ArrayBuffer | Buffer[]`. `server.ts` only handles `Buffer.isBuffer(data)`. In binary mode (`binaryType = 'arraybuffer'` set on the browser side), the Node.js `ws` server receives data as `Buffer` by default — but this is not guaranteed across all environments and ws versions. The `ArrayBuffer` and `Buffer[]` cases silently drop audio frames.

**Fix — normalise `RawData` to `Buffer` before forwarding:**

```typescript
// server.ts — replace the message handler

ws.on('message', (data: import('ws').RawData, isBinary: boolean) => {
  if (!dgReady) {
    // store raw for flush — normalise first
    const buf = toBuffer(data);
    if (buf) pendingAudio.push(buf);
    return;
  }
  const buf = toBuffer(data);
  if (buf) dg.send(buf);
});

function toBuffer(data: import('ws').RawData): Buffer | null {
  if (Buffer.isBuffer(data))        return data;
  if (data instanceof ArrayBuffer)  return Buffer.from(data);
  if (Array.isArray(data))          return Buffer.concat(data);
  return null;
}
```

---

### Issue 24 — `AudioWorklet` `addModule` called on `micCtx` but code uses old `ctx` name

**Root cause (introduced by Issue 11 fix + Issue 4 fix interaction):** Issue 11 splits into `micCtxRef` (16kHz) and `spkCtxRef` (24kHz). Issue 4's fix code still references `ctx` — the old single-context variable. After the split, `ctx` no longer exists. `ctx.audioWorklet.addModule(...)` throws `ReferenceError: ctx is not defined`.

**Fix — update Issue 4's worklet setup to reference `micCtx` explicitly:**

```typescript
// components/voice/VoiceCall.tsx — correct worklet setup with split contexts

const startCall = useCallback(async () => {
  const micCtx = new AudioContext({ sampleRate: 16000 });
  const spkCtx = new AudioContext({ sampleRate: 24000 });
  micCtxRef.current = micCtx;
  spkCtxRef.current = spkCtx;

  // Worklet must be added to micCtx — it processes mic audio at 16kHz
  await micCtx.audioWorklet.addModule('/pcm-processor.js');

  const stream = await navigator.mediaDevices.getUserMedia({ audio: { ... } });
  const source  = micCtx.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(micCtx, 'pcm-processor');

  worklet.port.onmessage = (e: MessageEvent<Float32Array>) => { /* send to WS */ };
  source.connect(worklet);
  // spkCtx is used only in playNext() — no worklet needed there
}, []);
```

---

### Issue 25 — Deepgram reconnect not handled on hard connection failure

**Root cause:** Issue 15 adds a keepalive for idle periods, but if Deepgram's WebSocket hard-fails — network blip, 401 (expired key), 402 (credit limit hit), or Deepgram outage — `LiveTranscriptionEvents.Error` fires and the connection is permanently dead. The student's call continues with the browser sending mic audio into a void. No error is surfaced, and transcription silently stops.

**Fix — detect close/error and attempt one reconnect, or notify the student:**

```typescript
// lib/voice/deepgramSTT.ts — add reconnect callback to STTCallbacks

export interface STTCallbacks {
  // ... existing ...
  onConnectionLost: (reason: string) => void;
}

conn.on(LiveTranscriptionEvents.Close, (code, reason) => {
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  // Code 1000 = normal close (we called requestClose). Anything else is unexpected.
  if (code !== 1000) {
    callbacks.onConnectionLost(`Deepgram closed: ${code} ${reason}`);
  }
});

conn.on(LiveTranscriptionEvents.Error, (err) => {
  if (keepaliveInterval) clearInterval(keepaliveInterval);
  callbacks.onConnectionLost(`Deepgram error: ${err.message}`);
});
```

In `server.ts`, handle it:
```typescript
onConnectionLost: (reason) => {
  console.error('[Voice]', reason);
  send({ type: 'error', message: 'Voice connection lost. Please end the call and try again.' });
  // Don't attempt auto-reconnect — Deepgram errors are often auth/billing
  // and reconnecting would spam the API. Let the student restart.
},
```

---

### Issue 26 — `lib/env.ts` is parsed before `.env.local` loads in `server.ts`

**Root cause:** `tsx server.ts` runs in plain Node.js — there's no Next.js runtime to load `.env.local` automatically. `import { env } from './lib/env'` executes `envSchema.parse(process.env)` immediately, before any dotenv loading. Every env var is `undefined`, Zod throws, and the server crashes before it starts.

**Fix — load `.env.local` before any other imports in `server.ts`:**

```typescript
// server.ts — this MUST be the very first line, before all other imports
import 'dotenv/config';    // loads .env.local automatically in Node

// Then all other imports follow
import { createServer } from 'http';
// ...
```

Install dotenv if not already present (it's likely already a transitive dep from Next.js):
```bash
npm install dotenv
```

Create `.env` as a symlink or copy for environments where `.env.local` isn't used (production uses platform env vars directly — `dotenv/config` is a no-op when vars are already set, so this is safe).

---

### Issue 27 — `MicSelector` `{ exact: deviceId }` throws unhandled `NotFoundError`

**Root cause:** `getUserMedia({ audio: { deviceId: { exact: micId } } })` throws `NotFoundError` (DOMException) if the selected microphone was unplugged after being chosen in the `MicSelector`. The `startCall` function has no `try/catch` around `getUserMedia`, so the error propagates to an unhandled rejection — the call never starts and the student sees nothing.

**Fix — catch `getUserMedia` errors and fall back to the default device:**

```typescript
// components/voice/VoiceCall.tsx — wrap getUserMedia in startCall

let stream: MediaStream;
try {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: micId ? { exact: micId } : undefined,
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
    }
  });
} catch (err) {
  if (err instanceof DOMException && err.name === 'NotFoundError') {
    // Selected mic was unplugged — retry with no deviceId constraint
    console.warn('[Voice] selected mic not found, falling back to default');
    setMicId(undefined);    // clear stale selection in UI
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, sampleRate: 16000, echoCancellation: true }
    });
  } else if (err instanceof DOMException && err.name === 'NotAllowedError') {
    // User denied microphone permission
    setCallError('Microphone permission denied. Please allow microphone access and try again.');
    endCall();
    return;
  } else {
    throw err;
  }
}
```

---

### Updated summary table (Issues 16–27)

| # | Issue | Severity | Fix location |
|---|---|---|---|
| 16 | Barge-in during `thinking` is silently ignored | 🔴 High | `server.ts` — abort `currentAbort` on `SpeechStarted` regardless of state |
| 17 | `processingLock` discards barge-in utterances | 🟠 Medium | `server.ts` — replace discard with single-slot pending queue |
| 18 | AudioWorklet sends 125 WS messages/sec | 🟡 Low | `public/pcm-processor.js` — accumulate to 4096 samples before posting |
| 19 | `getTTSClient()` caches undefined-key client | 🟠 Medium | `ttsStream.ts` — guard cache setter with key check |
| 20 | Encouragement TTS races with main response | 🟠 Medium | `server.ts` — pass `thisAbort` into `triggerSpeak` |
| 21 | `NEXT_PUBLIC_VOICE_TTS_VOICE` not in `env.ts` | 🟠 Medium | `lib/env.ts` + `.env.local` — add public version |
| 22 | `server.ts` fix still uses `@/lib/...` paths | 🔴 High | `server.ts` — use `./lib/...` relative paths throughout |
| 23 | `ws` `RawData` types not fully handled | 🟠 Medium | `server.ts` — `toBuffer()` normaliser for all `RawData` shapes |
| 24 | AudioWorklet references `ctx` after split-context fix | 🔴 High | `VoiceCall.tsx` — use `micCtx` explicitly |
| 25 | No reconnect or error surface on Deepgram hard failure | 🟠 Medium | `deepgramSTT.ts` — `onConnectionLost` callback |
| 26 | `lib/env.ts` parses before `.env.local` loads in `tsx` | 🔴 High | `server.ts` — `import 'dotenv/config'` as first line |
| 27 | `getUserMedia` `exact` deviceId throws unhandled error | 🟠 Medium | `VoiceCall.tsx` — `try/catch` with fallback to default device |

---

## 16. Third-Pass Issues & Fixes

Auditing the §14 and §15 fixes themselves — their interactions, internal logic errors, and remaining gaps — surfaces 12 more issues.

---

### Issue 28 — `dotenv/config` loads `.env`, not `.env.local`

**Root cause (in Issue 26 fix):** `import 'dotenv/config'` reads `.env` by default, not `.env.local`. Next.js treats `.env.local` as the primary secrets file and `.env` as committed defaults. The fix tells developers to add secrets to `.env.local` but the loader reads the wrong file — every var remains `undefined` and Zod still throws.

**Fix — explicitly load `.env.local` with `dotenv.config()`:**

```typescript
// server.ts — first two lines, before all other imports
import { config as loadEnv } from 'dotenv';

// Load .env.local first (secrets), then .env (committed defaults), only in dev
if (process.env.NODE_ENV !== 'production') {
  loadEnv({ path: '.env.local', override: false });
  loadEnv({ path: '.env',       override: false });
}

// Now safe to import lib/env.ts — process.env is populated
import { createServer } from 'http';
// ...
```

`override: false` means already-set vars (e.g. CI env vars or platform injection) take priority. The `NODE_ENV !== 'production'` guard skips the `fs.readFileSync` attempt in production where platform env vars are injected natively.

> **Note:** ES module `import` statements are hoisted — a bare `import 'dotenv/config'` runs *after* all other static imports regardless of line order. Use the `config()` function call pattern above so the load happens at the right time. If using CJS (`require`), `require('dotenv').config({ path: '.env.local' })` is fine as the first line.

---

### Issue 29 — `processTurn` recursive call in `finally` can stack-overflow

**Root cause (in Issue 17 fix):** `processTurn` calls itself from its own `finally` block:

```typescript
finally {
  processingLock = false;
  if (pendingTurn) {
    const next = pendingTurn;
    pendingTurn = null;
    await processTurn(next);   // ← recursive
  }
}
```

Each turn adds a stack frame. At voice interaction speeds (student speaking every 5–10 seconds) depth stays at 1–2, but rapid-fire utterances during testing or a malfunctioning mic flooding `UtteranceEnd` events can deepen the stack indefinitely. More importantly, `async` recursion in Node.js doesn't benefit from tail-call optimisation — each frame holds the TTS generator, agent stream, and AbortController in memory.

**Fix — use a `while` loop instead of recursion:**

```typescript
// server.ts — replace recursive processTurn

async function processTurn(firstTranscript: string) {
  let transcript = firstTranscript;
  while (transcript) {
    processingLock = true;
    pendingTurn = null;
    try {
      await runOneTurn(transcript);
    } finally {
      processingLock = false;
    }
    // Pick up any utterance that arrived during this turn
    transcript = pendingTurn ?? '';
  }
}

async function runOneTurn(transcript: string) {
  // ... the agent + TTS pipeline body, previously inside processTurn ...
}
```

This keeps the call stack flat regardless of how many queued turns arrive.

---

### Issue 30 — Barge-in clears `processingLock` before `finally` runs, enabling concurrent turns

**Root cause (Issues 16 + 17 interaction):** Issue 16's fix sets `processingLock = false` inside `onSpeechStart`. Issue 17's `processTurn` also sets `processingLock = false` in its `finally`. If barge-in clears the lock and a new `UtteranceEnd` arrives before `finally` runs (possible because `onSpeechStart` and the async `processTurn` run on the Node.js event loop in interleaved fashion), a second `processTurn` call starts while the first one is still in its `finally` cleanup. Two turns run concurrently — exactly the race Issues 1 and 17 were meant to prevent.

**Fix — only let `processTurn`'s `finally` manage the lock; barge-in sets a cancel flag instead:**

```typescript
// server.ts — decouple barge-in from lock management

let cancelCurrentTurn = false;   // set by onSpeechStart; read by runOneTurn

onSpeechStart: () => {
  resetIdle();
  if (agentState === 'speaking' || agentState === 'thinking') {
    currentAbort?.abort();
    cancelCurrentTurn = true;    // signal runOneTurn to exit early
    if (agentState === 'speaking') send({ type: 'tts_interrupted' });
    agentState = 'listening';
    // DO NOT touch processingLock here — let finally handle it
  }
},

async function runOneTurn(transcript: string) {
  cancelCurrentTurn = false;
  agentState = 'thinking';
  send({ type: 'thinking' });
  const thisAbort = new AbortController();
  currentAbort = thisAbort;

  try {
    // ... agent + TTS pipeline ...
    // Check cancelCurrentTurn before sending each PCM chunk:
    for await (const pcm of streamTTS(withFlag, thisAbort.signal)) {
      if (cancelCurrentTurn) break;
      if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
    }
  } finally {
    currentAbort = null;
    agentState = 'idle';
    // Lock is released by processTurn's finally — not here
  }
}
```

`processTurn`'s `while` loop (from Issue 29) naturally picks up the next pending turn after `runOneTurn` returns, whether it exited normally or via cancellation.

---

### Issue 31 — `runAgent()` return value double-awaited incorrectly

**Root cause:** `§6` (`agentBridge.ts`) has:

```typescript
const result = runAgent({ messages, threadId, voiceMode: true });
const stream = (await result).textStream;
```

`runAgent()` in `lib/agent/index.ts` uses the Vercel AI SDK's `streamText()` which returns a `StreamTextResult` synchronously (not a Promise). If `runAgent` is not declared `async`, `result` is already the `StreamTextResult`. `await result` on a non-Promise just resolves to the value itself — harmless but confusing. If `runAgent` *is* `async` (which it likely is, since it calls `getHistory()` internally), then `result` is `Promise<StreamTextResult>` and the double-await is correct.

The issue is that the spec doesn't reflect which case applies — and if `runAgent` changes between sync and async, this silently breaks. `.textStream` on `undefined` throws `TypeError`.

**Fix — be explicit:**

```typescript
// lib/voice/agentBridge.ts — defensive pattern

const agentResult = await Promise.resolve(
  runAgent({ messages: [...historyMessages, ...userMsg], threadId, voiceMode: true })
);
const stream = agentResult.textStream;
```

`Promise.resolve()` works correctly whether `runAgent` returns a value or a Promise — always gives back a Promise to await.

---

### Issue 32 — `pcm-processor.js` buffer overflow on non-128-sample worklet blocks

**Root cause (in Issue 18 fix):** The `PCMProcessor` accumulates into a fixed `Float32Array(4096)` and calls `this._buffer.set(channel, this._offset)`. The spec assumes `channel.length === 128` always (the Web Audio API standard quantum size). However, the spec allows implementations to vary. Safari occasionally delivers different block sizes. If `this._offset + channel.length > 4096`, `TypedArray.set()` throws `RangeError: offset is out of bounds` — crashing the AudioWorklet thread permanently. The mic silently stops sending audio, no error is visible in the main thread.

**Fix — check bounds before writing, flush early if needed:**

```javascript
// public/pcm-processor.js — bounds-safe accumulation

process(inputs) {
  const channel = inputs[0]?.[0];
  if (!channel) return true;

  let src = 0;
  while (src < channel.length) {
    const space = this._buffer.length - this._offset;
    const take  = Math.min(space, channel.length - src);
    this._buffer.set(channel.subarray(src, src + take), this._offset);
    this._offset += take;
    src += take;

    if (this._offset >= this._buffer.length) {
      this.port.postMessage(this._buffer.slice(0, this._offset));
      this._offset = 0;
    }
  }
  return true;
}
```

This handles any block size correctly — flushing mid-channel if necessary.

---

### Issue 33 — `streamTTS` `flush()` TTS API errors kill the entire voice stream

**Root cause:** `flush()` inside `streamTTS` calls `ttsClient.audio.speech.create(...)`. If the TTS provider returns a 429 (rate limit) or 500, the SDK throws. This propagates out of `yield* flush(buffer)` and terminates the entire `streamTTS` generator — including all remaining agent chunks. The `server.ts` `catch (err)` catches it and sends a generic error to the browser, but the student gets cut off mid-response with no retry.

**Fix — catch TTS errors per-chunk and degrade gracefully:**

```typescript
// lib/voice/ttsStream.ts — wrap flush in per-sentence error handling

async function* flush(text: string): AsyncGenerator<Uint8Array> {
  const cleaned = cleanForSpeech(text);
  if (!cleaned || abort.aborted) return;

  try {
    const res = await getTTSClient().audio.speech.create({
      model:           env.VOICE_TTS_MODEL,
      voice:           env.VOICE_TTS_VOICE as any,
      input:           cleaned,
      response_format: 'pcm',
    }, { signal: abort });

    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      if (abort.aborted) return;
      yield chunk;
    }
  } catch (err: any) {
    if (abort.aborted) return;   // expected — don't log
    // Log but continue — remaining sentences will still be attempted
    console.error('[Voice/TTS] sentence failed, skipping:', err?.status ?? err?.message);
    // Optionally yield a silence buffer here so playback doesn't glitch
  }
}
```

This means a single TTS failure skips one sentence rather than terminating the entire response.

---

### Issue 34 — `SpeechStarted` during greeting fires with `agentState === 'idle'`

**Root cause:** When the WebSocket connection opens, `agentState` is initialised as `'idle'`. The greeting `triggerSpeak` is called — but before it sets `agentState = 'speaking'`, there's a gap while the TTS API request is in flight. If a student starts speaking immediately (before the first PCM byte arrives), `SpeechStarted` fires. `onSpeechStart` checks `agentState === 'speaking' || agentState === 'thinking'` — neither matches `'idle'`, so barge-in doesn't fire and the greeting talks over the student.

**Fix — set `agentState = 'speaking'` *before* making the TTS API call, not after the first chunk:**

```typescript
// server.ts — update triggerSpeak to set state eagerly

async function triggerSpeak(text: string, abort: AbortController) {
  abort.signal.throwIfAborted();
  agentState = 'speaking';         // set BEFORE the API call
  currentAbort = abort;            // register so onSpeechStart can abort it
  // ...rest of TTS streaming
}
```

For the greeting specifically, set state before calling `triggerSpeak`:
```typescript
dg.on(LiveTranscriptionEvents.Open, () => {
  dgReady = true;
  for (const chunk of pendingAudio) dg.send(chunk);
  pendingAudio.length = 0;
  const greetAbort = new AbortController();
  currentAbort = greetAbort;
  agentState = 'speaking';         // set before async gap
  triggerSpeak(`Hello! I'm your ${env.NEXT_PUBLIC_APP_NAME} assistant...`, greetAbort)
    .catch(console.error);
});
```

---

### Issue 35 — `pendingAudio` buffer in Issue 2 fix is unbounded

**Root cause:** If the Deepgram WebSocket takes a long time to open (slow network, DG API degradation), the browser keeps sending mic PCM and `pendingAudio` grows indefinitely. At 16kHz stereo PCM with 4096-sample chunks arriving every 256ms, that's ~128KB/sec — small per second but with no cap, a multi-second delay fills memory with stale audio that DG will transcribe as noise when it finally opens.

**Fix — cap the pending buffer and discard old audio:**

```typescript
// server.ts — bounded pendingAudio

const MAX_PENDING_BYTES = 32768;   // ~1 second of 16kHz mono PCM
let pendingAudioBytes = 0;

ws.on('message', (data: import('ws').RawData) => {
  const buf = toBuffer(data);
  if (!buf) return;
  if (!dgReady) {
    if (pendingAudioBytes + buf.length <= MAX_PENDING_BYTES) {
      pendingAudio.push(buf);
      pendingAudioBytes += buf.length;
    }
    // else discard — too old to be useful, DG would transcribe stale audio
    return;
  }
  dg.send(buf);
});

// Reset counter on flush
dg.on(LiveTranscriptionEvents.Open, () => {
  dgReady = true;
  for (const chunk of pendingAudio) dg.send(chunk);
  pendingAudio.length = 0;
  pendingAudioBytes = 0;
  // ... greet
});
```

---

### Issue 36 — Mixed binary/JSON on a single WebSocket is ambiguous under load

**Root cause:** Server sends JSON events (`{ type: 'thinking' }`) and raw PCM `ArrayBuffer` on the same WebSocket connection. The browser distinguishes by `e.data instanceof ArrayBuffer`. Under load, WS frames can be fragmented or reordered at the OS level (though TCP guarantees order, application-level framing can still cause surprises with large messages). More practically, some browser WS implementations have a bug where `binaryType = 'arraybuffer'` causes a large JSON string to arrive as an `ArrayBuffer` of its UTF-8 bytes rather than a string — misidentified as audio, fed to `AudioContext`, and played as noise.

**Fix — add a 1-byte message-type prefix to all messages:**

```typescript
// server.ts — prefix all messages

const MSG_JSON   = 0x01;
const MSG_BINARY = 0x02;

function sendJson(obj: object) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const json = Buffer.from(JSON.stringify(obj));
  const msg  = Buffer.concat([Buffer.from([MSG_JSON]), json]);
  ws.send(msg);
}

function sendPcm(pcm: Uint8Array) {
  if (ws.readyState !== WebSocket.OPEN) return;
  const msg = Buffer.concat([Buffer.from([MSG_BINARY]), pcm]);
  ws.send(msg);
}
```

Browser side:
```typescript
ws.onmessage = (e) => {
  const raw = new Uint8Array(e.data as ArrayBuffer);
  const type = raw[0];
  if (type === 0x01) {
    const json = JSON.parse(new TextDecoder().decode(raw.slice(1)));
    // handle JSON events
  } else if (type === 0x02) {
    const pcm = raw.slice(1).buffer;
    queue.current.push(pcm);
    playNext(spkCtx);
  }
};
```

This makes the framing deterministic regardless of browser WS implementation details.

---

### Issue 37 — `endCall` doesn't stop `MediaStream` tracks — mic stays active

**Root cause:** `endCall` closes the WebSocket and the `AudioContext` but never calls `stream.getTracks().forEach(t => t.stop())`. The mic LED stays on in the browser. On mobile, this keeps the audio session active and prevents other apps from using the mic. On desktop, students see a persistent browser mic indicator and may think the call is still running.

**Fix — store the stream ref and stop tracks on `endCall`:**

```typescript
// components/voice/VoiceCall.tsx

const streamRef = useRef<MediaStream | null>(null);

// In startCall, after getUserMedia:
streamRef.current = stream;

// In endCall:
const endCall = useCallback(() => {
  wsRef.current?.close();
  micCtxRef.current?.close();
  spkCtxRef.current?.close();
  streamRef.current?.getTracks().forEach(t => t.stop());   // release mic
  streamRef.current   = null;
  wsRef.current       = null;
  micCtxRef.current   = null;
  spkCtxRef.current   = null;
  stopAudio();
  setActive(false);
  setState('idle');
  setInterim('');
}, []);

// Also call in ws.onclose handler to handle server-initiated close:
ws.onclose = () => {
  streamRef.current?.getTracks().forEach(t => t.stop());
  streamRef.current = null;
  setActive(false);
  setState('idle');
  setInterim('');
};
```

---

### Updated summary table (Issues 28–39)

| # | Issue | Severity | Fix location |
|---|---|---|---|
| 28 | `dotenv/config` reads `.env` not `.env.local` | 🔴 High | `server.ts` — `loadEnv({ path: '.env.local' })` |
| 29 | `processTurn` recursive `finally` can stack-overflow | 🟠 Medium | `server.ts` — replace with `while` loop |
| 30 | Barge-in clears `processingLock` before `finally`, enabling concurrent turns | 🔴 High | `server.ts` — cancel flag separate from lock management |
| 31 | `runAgent()` double-await is fragile | 🟡 Low | `agentBridge.ts` — `await Promise.resolve(runAgent(...))` |
| 32 | `pcm-processor.js` buffer overflow on non-128-sample blocks | 🟠 Medium | `public/pcm-processor.js` — bounds-safe accumulation loop |
| 33 | TTS API errors kill entire voice stream | 🟠 Medium | `ttsStream.ts` — per-sentence `try/catch` inside `flush()` |
| 34 | `SpeechStarted` during greeting ignored (`agentState === 'idle'`) | 🟠 Medium | `server.ts` — set `agentState = 'speaking'` eagerly before API call |
| 35 | `pendingAudio` buffer is unbounded | 🟡 Low | `server.ts` — 32KB cap, discard excess |
| 36 | Mixed binary/JSON on one WebSocket is ambiguous | 🟡 Low | `server.ts` + `VoiceCall.tsx` — 1-byte message-type prefix |
| 37 | `endCall` doesn't release mic tracks | 🔴 High | `VoiceCall.tsx` — `streamRef` + `getTracks().forEach(t => t.stop())` |
