'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDeepgramVoice, AgentState, Source } from '@/lib/voice/useDeepgramVoice';
import { Button } from '@/components/ui/button';
import { Persona, PersonaState } from '@/components/ai-elements/persona';
import { PhoneOff } from 'lucide-react';
import type { UIMessage } from '@ai-sdk/react';

export interface VoiceMessagePayload {
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

interface VoiceChatProps {
  messages?: UIMessage[];
  onClose?: () => void;
  onMessageAdded?: (msg: VoiceMessagePayload) => void;
  onShowNotes?: (topic: string) => void;
  institutionName?: string;
}

const stateLabels: Record<AgentState, string> = {
  idle: 'Ready to talk',
  connecting: 'Connecting...',
  listening: 'Listening...',
  thinking: 'Thinking...',
  speaking: 'Speaking...',
};

const personaStateMap: Record<AgentState, PersonaState> = {
  idle: 'idle',
  connecting: 'idle',
  listening: 'listening',
  thinking: 'thinking',
  speaking: 'speaking',
};

export function VoiceChat({ messages, onClose, onMessageAdded, onShowNotes, institutionName }: VoiceChatProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const [currentSources, setCurrentSources] = useState<Source[]>([]);

  useEffect(() => {
    fetch('/api/voice-token')
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setApiKey(data.apiKey);
        }
      })
      .catch(err => {
        setError('Failed to get API key');
        console.error(err);
      });
  }, []);



  const handleUserMessage = useCallback((text: string) => {
    setCurrentTranscript(text);
    if (text.trim()) {
      onMessageAdded?.({ role: 'user', content: text });
    }
  }, [onMessageAdded]);

  const handleAgentMessage = useCallback((text: string) => {
    setAgentResponse(text);
    if (text.trim()) {
      onMessageAdded?.({ role: 'assistant', content: text, sources: currentSources });
      setCurrentSources([]);
    }
  }, [currentSources, onMessageAdded]);

  const handleStateChange = useCallback((newState: AgentState) => {
    if (newState === 'listening') {
      setCurrentTranscript('');
    }
    if (newState !== 'speaking') {
      setAgentResponse('');
    }
  }, []);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const handleSources = useCallback((sources: Source[]) => {
    setCurrentSources(sources);
  }, []);

  const handleShowNotes = useCallback((topic: string) => {
    onShowNotes?.(topic);
  }, [onShowNotes]);

  const { state, start, stop } = useDeepgramVoice({
    apiKey,
    history: messages,
    onUserMessage: handleUserMessage,
    onAgentMessage: handleAgentMessage,
    onStateChange: handleStateChange,
    onError: handleError,
    onSources: handleSources,
    onRequestNotes: handleShowNotes,
    institutionName,
  });

  const handleEnd = useCallback(() => {
    stop();
    onClose?.();
  }, [stop, onClose]);

  useEffect(() => {
    if (apiKey && state === 'idle') {
      start();
    }
  }, [apiKey, state, start]);

  const isInCall = state !== 'idle';

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col pointer-events-auto">
      <header className="flex justify-between items-center p-4 border-b">
        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {isInCall ? (
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
            </span>
          ) : (
            <span className="h-3 w-3 rounded-full bg-muted-foreground"></span>
          )}
          Voice Assistant
        </span>
        <Button variant="ghost" size="sm" onClick={() => { handleEnd(); onClose?.(); }} className="text-muted-foreground">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x h-4 w-4 mr-1"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          Close
        </Button>
      </header>

      <div className="flex-1 flex flex-col justify-center items-center overflow-hidden p-6 relative">
        {error ? (
          <div className="flex flex-col items-center justify-center space-y-4 max-w-sm text-center">
            <div className="p-4 bg-destructive/10 rounded-full text-destructive">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            </div>
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        ) : !apiKey ? (
          <div className="flex flex-col items-center justify-center space-y-4 text-muted-foreground">
            <div className="animate-pulse">Connecting...</div>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center shrink-0 w-full max-w-lg transition-all duration-500 ease-in-out">
              <Persona
                state={personaStateMap[state]}
                variant="halo"
                className="size-32 md:size-48 mb-8 transition-all duration-300"
              />
              <p className="text-base md:text-lg font-medium text-muted-foreground min-h-[28px] animate-in fade-in transition-opacity">
                {stateLabels[state]}
              </p>
            </div>

            <div className="absolute bottom-24 w-full px-6 flex flex-col items-center justify-end max-h-[30vh] overflow-hidden pointer-events-none">
              {(state === 'listening' && currentTranscript) && (
                <div className="animate-in slide-in-from-bottom-4 fade-in duration-300 text-center max-w-2xl px-4 mix-blend-plus-lighter">
                  <p className="text-lg md:text-xl font-medium text-muted-foreground line-clamp-2 drop-shadow-sm">
                    &quot;{currentTranscript}&quot;
                  </p>
                </div>
              )}
              {(state === 'speaking' && agentResponse) && (
                <div className="animate-in slide-in-from-bottom-4 fade-in duration-300 text-center max-w-3xl px-4">
                  <p className="text-lg md:text-xl font-semibold text-primary line-clamp-3 leading-relaxed drop-shadow-md">
                    {agentResponse}
                  </p>
                </div>
              )}
              {state === 'thinking' && (
                <div className="animate-in fade-in duration-200 flex items-center gap-3 text-muted-foreground bg-muted/50 py-3 px-5 rounded-full backdrop-blur-md border border-border/50">
                  <svg className="animate-spin size-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="font-medium tracking-wide">Searching knowledge base...</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="flex justify-center items-center p-6 gap-4 border-t bg-background/50">
        {!isInCall ? (
          <Button
            onClick={start}
            disabled={!apiKey}
            size="lg"
            className="rounded-full shadow-lg h-14 w-full max-w-sm text-base gap-2"
          >
            Start Conversation
          </Button>
        ) : (
          <Button
            variant="destructive"
            size="lg"
            onClick={() => { handleEnd(); onClose?.(); }}
            className="rounded-full shadow-lg h-14 w-full max-w-sm text-base gap-2"
          >
            <PhoneOff className="h-5 w-5" />
            End Call
          </Button>
        )}
      </footer>
    </div>
  );
}
