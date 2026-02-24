import { useCallback, useRef, useState } from 'react';

export type AgentState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

export interface VoiceMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface UseDeepgramVoiceOptions {
  apiKey: string | null;
  onUserMessage?: (text: string) => void;
  onAgentMessage?: (text: string) => void;
  onStateChange?: (state: AgentState) => void;
  onError?: (error: Error) => void;
}

export function useDeepgramVoice({
  apiKey,
  onUserMessage,
  onAgentMessage,
  onStateChange,
  onError,
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

  const updateState = useCallback((newState: AgentState) => {
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

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
        playAudioQueue();
      } else if (wsRef.current?.readyState === WebSocket.OPEN) {
        updateState('listening');
      }
    };
    
    source.start();
  }, [updateState]);

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
          
          ws.send(JSON.stringify({
            type: 'SendFunctionCallResponse',
            id: func.id,
            name: func.name,
            content: JSON.stringify(result),
          }));
        } catch (error) {
          console.error('Function call error:', error);
          ws.send(JSON.stringify({
            type: 'SendFunctionCallResponse',
            id: func.id,
            name: func.name,
            content: JSON.stringify({ error: 'Failed to execute function' }),
          }));
        }
      }
    }
  }, []);

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
  }, [onUserMessage, onAgentMessage, updateState, playAudioQueue, onError, handleFunctionCall]);

  const start = useCallback(async () => {
    if (!apiKey) {
      onError?.(new Error('No API key'));
      return;
    }

    try {
      updateState('connecting');
      
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
        console.log('AudioContext resumed');
      }
      console.log('AudioContext state:', audioContextRef.current.state);
      
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      const ws = new WebSocket(
        'wss://agent.deepgram.com/v1/agent/converse',
        ['token', apiKey]
      );
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'Settings',
          audio: {
            input: { encoding: 'linear16', sample_rate: 16000 },
            output: { encoding: 'linear16', sample_rate: 24000 },
          },
          agent: {
            language: 'en',
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
            },
            speak: {
              provider: {
                type: 'deepgram',
                model: 'aura-2-thalia-en',
              },
            },
          },
        }));
        
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
          onError?.(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`));
        }
        updateState('idle');
      };

    } catch (error) {
      console.error('Start error:', error);
      onError?.(error instanceof Error ? error : new Error('Failed to start'));
      updateState('idle');
    }
  }, [apiKey, updateState, handleMessage, onError]);

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

  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch {}
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
      } catch {}
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
1. Use the vector_search function to find relevant information before answering questions.
2. Keep responses concise and conversational since this is a voice interaction.
3. If you find relevant information, cite the source naturally (e.g., "According to the university website...").
4. If no relevant information is found, let the user know and suggest they check the official university website.
5. Be friendly and helpful while maintaining professionalism.

Remember: You're having a voice conversation, so keep your responses natural and easy to understand when spoken aloud.`;
}
