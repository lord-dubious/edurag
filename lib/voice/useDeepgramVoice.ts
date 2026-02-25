import {
  useState,
  useCallback,
  useRef,
  useEffect
} from 'react';
import type { UIMessage } from '@ai-sdk/react';

export type AgentState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface Source {
  url: string;
  title?: string;
  content: string;
}

export interface VoiceMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  sources?: Source[];
}

export interface UseDeepgramVoiceOptions {
  apiKey: string | null;
  history?: UIMessage[];
  onUserMessage?: (text: string) => void;
  onAgentMessage?: (text: string) => void;
  onStateChange?: (state: AgentState) => void;
  onError?: (error: Error) => void;
  onSources?: (sources: Source[]) => void;
  onRequestNotes?: (topic: string) => void;
  institutionName?: string;
}

export function useDeepgramVoice({
  apiKey,
  history,
  onUserMessage,
  onAgentMessage,
  onStateChange,
  onError,
  onSources,
  onRequestNotes,
  institutionName,
}: UseDeepgramVoiceOptions) {
  const [state, setState] = useState<AgentState>('idle');
  const [isPlaying, setIsPlaying] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const lastSearchResultsRef = useRef<string>('');

  const updateState = useCallback((newState: AgentState) => {
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  const playAudioQueueRef = useRef<() => void>(() => { });

  const playAudioQueue = useCallback(async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsPlaying(true);
    updateState('speaking');

    const audioContext = audioContextRef.current;
    if (!audioContext) {
      isPlayingRef.current = false;
      setIsPlaying(false);
      updateState('idle');
      return;
    }

    const sampleRate = 24000;
    const totalLength = audioQueueRef.current.reduce((sum, buf) => sum + (buf.byteLength / 2), 0);
    const allAudio = new Int16Array(totalLength);
    let offset = 0;
    for (const chunk of audioQueueRef.current) {
      const int16 = new Int16Array(chunk);
      allAudio.set(int16, offset);
      offset += int16.length;
    }
    audioQueueRef.current = [];

    const audioBuffer = audioContext.createBuffer(1, allAudio.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < allAudio.length; i++) {
      channelData[i] = allAudio[i] / 32768;
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    currentSourceRef.current = source;

    source.onended = () => {
      isPlayingRef.current = false;
      setIsPlaying(false);
      currentSourceRef.current = null;

      if (audioQueueRef.current.length > 0) {
        playAudioQueueRef.current?.();
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        updateState('listening');
      }
    };

    source.start();
  }, [updateState]);

  useEffect(() => {
    playAudioQueueRef.current = playAudioQueue;
  }, [playAudioQueue]);

  const sendSettings = useCallback((ws: WebSocket) => {
    if (typeof window === 'undefined') return;

    const deepgramHistory = history
      ?.filter(msg => msg.role === 'user' || msg.role === 'assistant')
      ?.filter(msg => {
        if ('content' in msg) return typeof msg.content === 'string' && msg.content.length > 0;
        return false;
      })
      ?.map(msg => ({
        type: 'History',
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: (msg as unknown as { content: string }).content
      })) || [];

    ws.send(JSON.stringify({
      type: 'Settings',
      flags: { history: true },
      audio: {
        input: { encoding: 'linear16', sample_rate: 24000 },
        output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
      },
      agent: {
        language: 'en',
        context: deepgramHistory.length > 0 ? { messages: deepgramHistory } : undefined,
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-3',
          },
        },
        think: {
          provider: {
            type: 'google',
            model: 'gemini-2.5-flash',
          },
          prompt: getSystemPrompt(institutionName),
          functions: [
            {
              name: 'vector_search',
              description: 'Search the university knowledge base. ONLY call this for a NEW factual question you have not already answered. Do NOT call this for greetings, follow-ups, clarifications, or if you already have the answer from a previous search.',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'The search query to find relevant information.'
                  }
                },
                required: ['query']
              }
            }
          ]
        },
        speak: {
          provider: {
            type: 'deepgram',
            model: 'aura-2-thalia-en',
          },
        },
      }
    }));
  }, [history, institutionName]);

  const handleFunctionCall = useCallback(async (data: { functions: Array<{ id: string; name: string; arguments: string }> }) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    for (const func of data.functions) {
      if (func.name === 'vector_search') {
        try {
          const args = JSON.parse(func.arguments);
          const response = await fetch('/api/voice-function', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: func.name, arguments: args }),
          });
          const result = await response.json();

          if (result.results && result.results.length > 0) {
            onSources?.(result.results);

            const plainTextContext = result.results
              .map((r: { title?: string; content: string }) =>
                `${r.title ? r.title + ': ' : ''}${stripMarkdownForVoice(r.content)}`
              )
              .join('\n\n');
            lastSearchResultsRef.current = plainTextContext;

            onRequestNotes?.(args.query);

            ws.send(JSON.stringify({
              type: 'FunctionCallResponse',
              id: func.id,
              name: func.name,
              content: `Use the following information to answer the user's question naturally, as if you already know it. Never mention searching, databases, or results. Just answer their question directly and thoroughly like a knowledgeable person would.\n\n${plainTextContext}`,
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'FunctionCallResponse',
              id: func.id,
              name: func.name,
              content: 'No results were found in the knowledge base. Let the user know you could not find that specific information and suggest they contact the university directly or check the official website.',
            }));
          }
        } catch (error) {
          console.error('Function call error:', error);
          ws.send(JSON.stringify({
            type: 'FunctionCallResponse',
            id: func.id,
            name: func.name,
            content: JSON.stringify({ error: 'Failed to execute function' }),
          }));
        }
      }
    }
  }, [onSources, onRequestNotes]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      console.log('Received audio chunk:', event.data.byteLength, 'bytes');
      audioQueueRef.current.push(event.data);
      if (!isPlayingRef.current && audioQueueRef.current.length > 0) {
        playAudioQueue();
      }
      return;
    }

    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (data.type) {
      case 'Welcome':
        console.log('Deepgram connected:', data);
        if (wsRef.current) {
          sendSettings(wsRef.current);
        }
        break;

      case 'SettingsApplied':
        console.log('Settings applied');
        break;

      case 'UserStartedSpeaking':
        if (isPlayingRef.current && currentSourceRef.current) {
          currentSourceRef.current.stop();
          currentSourceRef.current = null;
          isPlayingRef.current = false;
          setIsPlaying(false);
          audioQueueRef.current = [];
        }
        updateState('listening');
        break;

      case 'ConversationText':
        if (data.role === 'user') {
          onUserMessage?.(data.content);
        } else if (data.role === 'assistant') {
          onAgentMessage?.(data.content);
        }
        break;

      case 'AgentThinking':
        updateState('thinking');
        break;

      case 'AgentStartedSpeaking':
        updateState('speaking');
        break;

      case 'AgentAudioDone':
        if (audioQueueRef.current.length > 0) {
          playAudioQueue();
        } else {
          updateState('listening');
        }
        break;

      case 'FunctionCallRequest':
        handleFunctionCall(data);
        break;

      case 'Error':
        console.error('Deepgram error:', JSON.stringify(data, null, 2));
        const errorMsg = data.description || data.message || data.err_msg || JSON.stringify(data);
        onError?.(new Error(errorMsg));
        break;

      case 'Warning':
        console.warn('Deepgram warning:', data);
        break;

      default:
        console.log('Deepgram message:', data.type, data);
    }
  }, [onUserMessage, onAgentMessage, updateState, playAudioQueue, onError, handleFunctionCall, sendSettings]);

  const cleanupAudioResources = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch { }
      currentSourceRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch { }
      });
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch { }
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  const stop = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close(1000, 'User ended call');
      wsRef.current = null;
    }

    cleanupAudioResources();
    updateState('idle');
  }, [updateState, cleanupAudioResources]);

  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  const startAudioCapture = useCallback(async () => {
    const stream = mediaStreamRef.current;
    const audioContext = audioContextRef.current;
    if (!stream || !audioContext) return;

    const source = audioContext.createMediaStreamSource(stream);

    await audioContext.audioWorklet.addModule('/audio-processor.js');

    const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
    workletNodeRef.current = workletNode;

    workletNode.port.onmessage = (event) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(event.data);
      }
    };

    source.connect(workletNode);
  }, []);

  const isStartingRef = useRef(false);
  const start = useCallback(async () => {
    if (!apiKey || isStartingRef.current) {
      if (!apiKey) onError?.(new Error('No API key'));
      return;
    }
    isStartingRef.current = true;

    try {
      updateState('connecting');

      audioContextRef.current = new AudioContext({ sampleRate: 24000 });

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('AudioContext resumed');
      }
      console.log('AudioContext state:', audioContextRef.current.state);

      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      const ws = new WebSocket(
        'wss://agent.deepgram.com/v1/agent/converse',
        ['token', apiKey]
      );
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[Deepgram] WebSocket opened, waiting for Welcome...');
        startAudioCapture();
        updateState('listening');
      };

      ws.onmessage = handleMessage;

      ws.onerror = (event) => {
        console.error('WebSocket error event:', event);
        cleanupAudioResources();
        onError?.(new Error('WebSocket connection failed. Check your API key.'));
        updateState('idle');
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        cleanupAudioResources();
        if (event.code !== 1000 && event.code !== 1005) {
          onError?.(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`));
        }
        updateState('idle');
      };
    } catch (error) {
      console.error('Start error:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to start'));
      updateState('idle');
    } finally {
      isStartingRef.current = false;
    }
  }, [apiKey, updateState, handleMessage, onError, startAudioCapture, cleanupAudioResources]);


  const interrupt = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'Interrupt' }));
    }

    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch { }
      currentSourceRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    updateState('listening');
  }, [updateState]);

  return {
    state,
    isPlaying,
    start,
    stop,
    interrupt,
  };
}

export function stripMarkdownForVoice(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s*/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^[-:| ]+$/gm, '')
    .replace(/https?:\/\/[^\s)]+/g, '')
    .replace(/[*#~`\[\]{}()<>]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

export function getSystemPrompt(institutionName?: string): string {
  const name = institutionName || 'the university';
  return `You are a senior advisor at ${name} on a phone call with a student. You genuinely care about helping them and love talking about the university.

PERSONALITY: Warm, enthusiastic, thorough. You enjoy explaining things in detail. You talk like someone who has worked at ${name} for years and knows everything about it.

WHEN TO SEARCH:
- Search ONLY when the user asks a NEW factual question you do not already know the answer to.
- Do NOT search for greetings like "hi" or "hello" or "thanks".
- Do NOT search again if the user asks a follow-up about something you already discussed. Use what you already know from the previous search.
- Do NOT search if the user is just acknowledging, agreeing, or asking you to elaborate on what you just said.

HOW TO TALK:
- Never mention searching, looking up, or finding information. Just answer as if you already know.
- Never say "based on my search", "I found", "according to the results". Just say it directly: "Oh yeah, tuition for that program is about twelve thousand a year."
- Be THOROUGH. Do not summarize. Talk through every relevant detail as a real advisor would. If there are three programs that match, walk through each one, explaining what makes each special, what the requirements are, how long they take, and what careers they lead to.
- Use natural transitions: "And another thing worth knowing...", "Oh and speaking of that...", "Now here is the really important part..."
- Share your enthusiasm: "That is actually a really popular program" or "A lot of students love that one."

SPEECH RULES:
- Plain English only. Never say "star", "asterisk", "pound", "hashtag", or "bracket".
- Never read URLs or links aloud.
- Never use Markdown formatting.
- Detailed written notes appear automatically in the user's chat. You can mention this once briefly.`;
}
