'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDeepgramVoice, AgentState, VoiceMessage } from '@/lib/voice/useDeepgramVoice';
import { VOICE_CONVERSATION_KEY } from '@/lib/voice/config';
import { Button } from '@/components/ui/button';
import { Persona, PersonaState } from '@/components/ai-elements/persona';
import { Phone, PhoneOff, X } from 'lucide-react';

interface VoiceChatProps {
  onClose?: () => void;
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

export function VoiceChat({ onClose }: VoiceChatProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [agentResponse, setAgentResponse] = useState('');
  const [messages, setMessages] = useState<VoiceMessage[]>([]);

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

  useEffect(() => {
    const saved = localStorage.getItem(VOICE_CONVERSATION_KEY);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(VOICE_CONVERSATION_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  const handleUserMessage = useCallback((text: string) => {
    setCurrentTranscript(text);
    if (text.trim()) {
      setMessages(prev => [...prev, {
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }]);
    }
  }, []);

  const handleAgentMessage = useCallback((text: string) => {
    setAgentResponse(text);
    if (text.trim()) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: text,
        timestamp: Date.now(),
      }]);
    }
  }, []);

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

  const { state, isPlaying, start, stop, interrupt } = useDeepgramVoice({
    apiKey,
    onUserMessage: handleUserMessage,
    onAgentMessage: handleAgentMessage,
    onStateChange: handleStateChange,
    onError: handleError,
  });

  const handleEnd = useCallback(() => {
    stop();
    onClose?.();
  }, [stop, onClose]);

  const isInCall = state !== 'idle';

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-md flex flex-col">
      <header className="flex justify-between items-center p-4 border-b">
        <span className="text-sm font-medium text-muted-foreground">Voice Assistant</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
          <X className="h-4 w-4 mr-1" />
          Close
        </Button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-4">
        {error ? (
          <div className="text-center space-y-4">
            <div className="text-destructive text-lg">{error}</div>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        ) : !apiKey ? (
          <div className="text-muted-foreground animate-pulse">Connecting...</div>
        ) : (
          <>
            <Persona 
              state={personaStateMap[state]} 
              variant="halo" 
              className="size-32 md:size-40"
            />

            <div className="text-center space-y-3 max-w-xl">
              <p className="text-sm font-medium text-muted-foreground">
                {stateLabels[state]}
              </p>
              
              {state === 'listening' && currentTranscript && (
                <p className="text-xl md:text-2xl font-light text-center">
                  "{currentTranscript}"
                </p>
              )}
              
              {state === 'speaking' && agentResponse && (
                <p className="text-base text-muted-foreground text-center">
                  {agentResponse}
                </p>
              )}

              {state === 'thinking' && (
                <p className="text-sm text-muted-foreground">
                  Searching knowledge base...
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <footer className="flex justify-center items-center p-6 gap-3 border-t">
        {!isInCall ? (
          <Button 
            onClick={start}
            disabled={!apiKey}
            className="gap-2"
          >
            <Phone className="h-4 w-4" />
            Start Call
          </Button>
        ) : (
          <>
            <Button 
              variant="destructive" 
              onClick={handleEnd}
              className="gap-2"
            >
              <PhoneOff className="h-4 w-4" />
              End
            </Button>
            {isPlaying && (
              <Button 
                variant="outline" 
                onClick={interrupt}
              >
                Interrupt
              </Button>
            )}
          </>
        )}
      </footer>
    </div>
  );
}
