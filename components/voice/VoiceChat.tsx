'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mic, PhoneOff, RotateCcw, X } from 'lucide-react';
import type { UIMessage } from '@ai-sdk/react';
import { useDeepgramVoice } from '@/lib/voice/useDeepgramVoice';
import type { AgentState, Source } from '@/lib/voice/useDeepgramVoice';
import { Button } from '@/components/ui/button';
import { Persona } from '@/components/ai-elements/persona';
import type { PersonaState } from '@/components/ai-elements/persona';

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
  autoStart?: boolean;
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

interface VoiceConfig {
  sttModel: string;
  ttsModel: string;
  thinkModel: string;
}

export function VoiceChat({ messages, onClose, onMessageAdded, onShowNotes, institutionName, autoStart = false }: VoiceChatProps): React.JSX.Element {
  const router = useRouter();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFetchingSession, setIsFetchingSession] = useState(false);
  const [retryStartRequested, setRetryStartRequested] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const currentSourcesRef = useRef<Source[]>([]);

  const loadVoiceSession = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    setIsFetchingSession(true);
    try {
      const res = await fetch('/api/voice-token', { signal });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setApiKey(null);
        if (res.status === 401) {
          setError('You must be logged in to use voice chat.');
          return false;
        }
        const message = data && typeof data === 'object' && 'error' in data
          ? String((data as { error?: string }).error)
          : `Voice token request failed (${res.status})`;
        setError(message);
        return false;
      }

      if (!data || typeof data !== 'object') {
        setApiKey(null);
        setError('Voice token response was empty.');
        return false;
      }

      if ('error' in data && (data as { error?: string }).error) {
        setApiKey(null);
        setError(String((data as { error?: string }).error));
        return false;
      }

      const token = (data as { token?: unknown }).token;
      if (typeof token !== 'string' || token.trim().length === 0) {
        setApiKey(null);
        setError('Voice token response missing token.');
        return false;
      }

      setApiKey(token);
      const config = (data as { config?: unknown }).config;
      if (config && typeof config === 'object') {
        setVoiceConfig(config as VoiceConfig);
      }
      setError(null);
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return false;
      }
      setApiKey(null);
      setError('Failed to get API key');
      console.error(err);
      return false;
    } finally {
      setIsFetchingSession(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadVoiceSession(controller.signal);
    return () => { controller.abort(); };
  }, [loadVoiceSession]);

  const handleUserMessage = useCallback((text: string) => {
    setCurrentTranscript(text);
    if (text.trim()) {
      onMessageAdded?.({ role: 'user', content: text });
    }
  }, [onMessageAdded]);

  const handleAgentMessage = useCallback((text: string) => {
    setAgentResponse(text);
    if (text.trim()) {
      onMessageAdded?.({ role: 'assistant', content: text, sources: currentSourcesRef.current });
      currentSourcesRef.current = [];
    }
  }, [onMessageAdded]);

  const handleStateChange = useCallback((newState: AgentState) => {
    if (newState !== 'idle') {
      setError(null);
    }
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
    currentSourcesRef.current = sources;
  }, []);

  const handleShowNotes = useCallback((topic: string) => {
    onShowNotes?.(topic);
  }, [onShowNotes]);
  const handleLogin = useCallback(() => {
    router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/chat?voice=1')}`);
  }, [router]);

  const { state, start, stop, interrupt } = useDeepgramVoice({
    apiKey,
    history: messages,
    onUserMessage: handleUserMessage,
    onAgentMessage: handleAgentMessage,
    onStateChange: handleStateChange,
    onError: handleError,
    onSources: handleSources,
    onRequestNotes: handleShowNotes,
    institutionName,
    sttModel: voiceConfig?.sttModel,
    ttsModel: voiceConfig?.ttsModel,
    thinkModel: voiceConfig?.thinkModel,
  });

  const handleEnd = useCallback(() => {
    setRetryStartRequested(false);
    stop();
    onClose?.();
  }, [stop, onClose]);

  const handleRetry = useCallback(async () => {
    setError(null);
    setRetryStartRequested(true);

    if (!apiKey || isFetchingSession) {
      await loadVoiceSession();
    }
  }, [apiKey, isFetchingSession, loadVoiceSession]);

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart) return;
    if (apiKey && state === 'idle' && !autoStartedRef.current) {
      autoStartedRef.current = true;
      start();
    }
  }, [apiKey, autoStart, state, start]);

  useEffect(() => {
    if (!retryStartRequested) return;
    if (!apiKey || state !== 'idle' || isFetchingSession || error) return;

    setRetryStartRequested(false);
    void start();
  }, [apiKey, state, isFetchingSession, error, retryStartRequested, start]);

  const isInCall = state !== 'idle';
  const showTapToSpeak = Boolean(apiKey) && state === 'idle' && !error && !autoStart;
  const showAutoStarting = Boolean(apiKey) && state === 'idle' && !error && autoStart;
  const showInterrupt = state === 'speaking' || state === 'thinking';
  const errorMessage = error ?? '';
  const lowerError = errorMessage.toLowerCase();
  const isAuthError = lowerError.includes('logged in') || lowerError.includes('authentication required') || lowerError.includes('unauthorized');
  const isMicError = lowerError.includes('microphone') || lowerError.includes('mic') || lowerError.includes('notallowederror') || lowerError.includes('permission') || lowerError.includes('notfounderror');
  const isConnectionError = lowerError.includes('websocket') || lowerError.includes('connection closed') || lowerError.includes('network') || lowerError.includes('token');
  let errorTitle = errorMessage || 'Something went wrong';
  let errorBody = 'Please try again.';

  if (isAuthError) {
    errorTitle = 'Sign in required';
    errorBody = 'Please sign in to use voice chat.';
  } else if (isMicError) {
    errorTitle = 'Microphone access blocked';
    errorBody = 'Allow microphone access in your browser settings, then try again.';
  } else if (isConnectionError) {
    errorTitle = 'Voice connection failed';
    errorBody = 'Check your network connection and try again.';
  }

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
        <Button variant="ghost" size="sm" onClick={handleEnd} className="text-muted-foreground">
          <X className="h-4 w-4 mr-1" />
          Close
        </Button>
      </header>

      <div className="flex-1 flex flex-col justify-center items-center overflow-hidden p-6 relative">
        {error ? (
          <div className="flex flex-col items-center justify-center space-y-4 max-w-sm text-center">
            <div className="p-4 bg-destructive/10 rounded-full text-destructive">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            </div>
            <p className="text-sm font-medium text-destructive">{errorTitle}</p>
            <p className="text-xs text-muted-foreground">{errorBody}</p>
            {errorMessage && !isAuthError && !isMicError && !isConnectionError && errorMessage !== errorTitle && (
              <p className="text-[10px] text-muted-foreground/70">{errorMessage}</p>
            )}
            {isAuthError ? (
              <div className="flex items-center gap-2">
                <Button onClick={handleLogin}>Log in</Button>
                <Button variant="outline" onClick={() => void loadVoiceSession()} disabled={isFetchingSession}>
                  {isFetchingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  Retry
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => void handleRetry()} disabled={isFetchingSession}>
                {isFetchingSession ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
                  Retry
                </Button>
            )}
          </div>
        ) : isFetchingSession && !apiKey ? (
          <div className="flex flex-col items-center justify-center space-y-4 text-muted-foreground">
            <div className="flex items-center gap-2 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting...
            </div>
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
              {showAutoStarting && (
                <div className="mt-6 flex flex-col items-center gap-2 text-muted-foreground">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary animate-pulse" />
                    Starting voice…
                  </div>
                    <Button variant="outline" size="sm" onClick={start} className="rounded-full">
                     Retry start
                    </Button>
                </div>
              )}
              {showTapToSpeak && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  <Button
                    onClick={start}
                    size="lg"
                    className="rounded-full shadow-lg h-14 px-8 text-base gap-2"
                  >
                    <Mic className="h-5 w-5" />
                    Start voice
                  </Button>
                </div>
              )}
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
              {showInterrupt && (
                <div className="pointer-events-auto mt-4">
                  <Button variant="outline" size="sm" onClick={interrupt} className="rounded-full">
                    Stop reply
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="flex flex-col sm:flex-row justify-center items-center p-6 gap-2 sm:gap-4 border-t bg-background/50">
        {!isInCall ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEnd}
            className="rounded-full w-full max-w-sm sm:max-w-none sm:w-auto text-muted-foreground"
          >
            Back to text
          </Button>
        ) : (
          <>
            <Button
              variant="destructive"
              size="lg"
              onClick={handleEnd}
              className="rounded-full shadow-lg h-14 w-full max-w-sm sm:max-w-none sm:w-auto text-base gap-2"
            >
              <PhoneOff className="h-5 w-5" />
              End voice
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleEnd}
              className="rounded-full w-full max-w-sm sm:max-w-none sm:w-auto text-muted-foreground"
            >
              Back to text
            </Button>
          </>
        )}
      </footer>
    </div>
  );
}
