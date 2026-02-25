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
  onRequestNotes?: (topic: string, sources?: Source[]) => void;
}

function removeMarkdown(text: string): string {
  if (!text) return '';
  return text
    // Remove headers
    .replace(/^#+\s+/gm, '')
    // Remove bold/italic
    .replace(/(\*\*|__)(.*?)\1/g, '')
    .replace(/(\*|_)(.*?)\1/g, '')
    // Remove links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '')
    // Remove code blocks
    .replace(/\`\`\`[\s\S]*?\`\`\`/g, '')
    .replace(/\`([^`]+)\`/g, '')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove lists markers
    .replace(/^[\*\-\+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    // Remove images
    .replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
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
  // Store latest sources to pass to notes
  const latestSourcesRef = useRef<Source[]>([]);

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
    if (!audioContext) return;

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
            type: 'open_ai',
            model: 'gpt-4o-mini',
          },
          prompt: getSystemPrompt(),
          functions: [
            {
              name: 'vector_search',
              description: 'Search the university knowledge base for information. Use this when the user asks questions about the university, admissions, programs, etc. You MUST USE this function to answer questions about the university.',
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
            },
            {
              name: "show_detailed_notes",
              description: "Display rich Markdown documentation, lists, URLs, or tables in the user's chat window. Use this ONLY when you find complex information that is tedious to read aloud.",
              parameters: {
                type: "object",
                properties: {
                  topic: {
                    type: "string",
                    description: "The specific topic or program to show notes for (e.g., 'Computer Science Admissions Requirements')."
                  }
                },
                required: ["topic"]
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
  }, [history]);

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

          if (result.results) {
            // Keep original rich content for UI
            latestSourcesRef.current = result.results;
            onSources?.(result.results);

            // Create sanitized version for speech synthesis
            const sanitizedResults = {
              ...result,
              results: result.results.map((r: Source) => ({
                ...r,
                content: removeMarkdown(r.content)
              }))
            };

            ws.send(JSON.stringify({
              type: 'FunctionCallResponse',
              id: func.id,
              name: func.name,
              content: JSON.stringify(sanitizedResults),
            }));
          } else {
             ws.send(JSON.stringify({
              type: 'FunctionCallResponse',
              id: func.id,
              name: func.name,
              content: JSON.stringify(result),
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
      } else if (func.name === 'show_detailed_notes') {
        try {
          console.log(`[Deepgram] Handoff request received: ${func.name}`);
          const args = JSON.parse(func.arguments);
          if (args.topic) {
            console.log(`[Deepgram] Showing notes for topic:`, args.topic);
            // Pass current sources so text agent doesn't need to search again
            onRequestNotes?.(args.topic, latestSourcesRef.current);
          } else {
            console.warn(`[Deepgram] show_detailed_notes called but missing topic argument.`);
          }

          ws.send(JSON.stringify({
            type: 'FunctionCallResponse',
            id: func.id,
            name: func.name,
            content: "The detailed notes are now being displayed in the chat window. VERBALLY ACKNOWLEDGE THIS AND SUMMARIZE THE HIGHLIGHTS FOR THE USER NOW.",
          }));
        } catch (error) {
          console.error('Handoff error:', error);
          ws.send(JSON.stringify({
            type: 'FunctionCallResponse',
            id: func.id,
            name: func.name,
            content: "Failed to show notes.",
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

  const start = useCallback(async () => {
    if (!apiKey) {
      onError?.(new Error('No API key'));
      return;
    }

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
        onError?.(new Error('WebSocket connection failed. Check your API key.'));
        updateState('idle');
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        if (event.code !== 1000 && event.code !== 1005) {
          onError?.(new Error());
        }
        updateState('idle');
      };
    } catch (error) {
      console.error('Start error:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to start'));
      updateState('idle');
    }
  }, [apiKey, updateState, handleMessage, onError, startAudioCapture]);

  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch { }
      currentSourceRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User ended call');
      wsRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setIsPlaying(false);
    updateState('idle');
  }, [updateState]);

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

function getSystemPrompt(): string {
  return `You are a helpful university assistant. Your role is to help students find information about programs, admissions, tuition, campus life, and more.

IMPORTANT GUIDELINES:
1. IDENTITY: You are a single, unified agent. You speak through voice AND you type rich Markdown in the chat window. NEVER refer to a "text assistant" or "another agent". Use first-person singular ("I", "me", "my").
2. NO RAW LINKS: NEVER read raw URLs, web links, or file paths aloud. It sounds terrible when spoken.
3. VERBAL SUMMARIES: If you find relevant information using vector_search, IMMEDIATELY verbally summarize it in a natural, concise, and conversational voice. Start speaking the summary as soon as you have the information.
4. RICH DOCUMENTATION: If the information contains lists, complex details, or URLs, invoke the \`show_detailed_notes\` tool to "type" the rich version into the chat for the user.
5. CONTINUITY: When you use \`show_detailed_notes\`, explicitly tell the user: "I've put those details in the chat for you." Then, ALWAYS follow up with a brief (1-2 sentence) verbal highlight so you remain actively engaged in the answer.
6. NO MARKDOWN IN VOICE: NEVER use Markdown formatting (like **, _, #, or brackets) and NEVER use emojis in your SPOKEN response. Write in plain text only. The content you receive from tools may contain markdown; ignore the special characters and read it as natural text.
7. ACCURACY: Do not hallucinate. If no relevant information is found, suggest checking the official university website.
8. PERSONA: Be friendly, energetic, and helpful while maintaining professionalism.`;
}
