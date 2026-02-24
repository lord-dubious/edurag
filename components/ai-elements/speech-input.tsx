'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { MicIcon, MicOffIcon } from 'lucide-react';

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export interface SpeechInputProps {
  onTranscriptionChange?: (text: string) => void;
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
  lang?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  className?: string;
  disabled?: boolean;
}

type SpeechState = 'idle' | 'listening' | 'processing' | 'error';

export function SpeechInput({
  onTranscriptionChange,
  onAudioRecorded,
  lang = 'en-US',
  size = 'icon-sm',
  variant = 'ghost',
  className,
  disabled,
}: SpeechInputProps) {
  const [state, setState] = useState<SpeechState>('idle');
  const [isSupported, setIsSupported] = useState(false);
  const [useMediaRecorder, setUseMediaRecorder] = useState(false);
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (SpeechRecognitionAPI) {
      setIsSupported(true);
      setUseMediaRecorder(false);
      
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = lang;
      
      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        onTranscriptionChange?.(transcript);
      };
      
      recognition.onerror = (event: Event) => {
        const errorEvent = event as unknown as { error: string };
        console.error('Speech recognition error:', errorEvent.error);
        setState('error');
        setTimeout(() => setState('idle'), 1000);
      };
      
      recognition.onend = () => {
        if (state === 'listening') {
          setState('idle');
        }
      };
      
      recognitionRef.current = recognition;
    } else if (navigator.mediaDevices) {
      setIsSupported(true);
      setUseMediaRecorder(true);
    } else {
      setIsSupported(false);
    }
    
    return () => {
      recognitionRef.current?.abort();
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [lang, onTranscriptionChange, state]);

  const startListening = useCallback(async () => {
    if (!isSupported) return;
    
    setState('listening');
    
    if (useMediaRecorder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        
        const recorder = new MediaRecorder(stream);
        chunksRef.current = [];
        
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };
        
        recorder.onstop = async () => {
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
          stream.getTracks().forEach(t => t.stop());
          
          if (onAudioRecorded) {
            setState('processing');
            try {
              const text = await onAudioRecorded(blob);
              onTranscriptionChange?.(text);
            } catch (err) {
              console.error('Transcription error:', err);
              setState('error');
              setTimeout(() => setState('idle'), 1000);
              return;
            }
          }
          setState('idle');
        };
        
        mediaRecorderRef.current = recorder;
        recorder.start();
      } catch (err) {
        console.error('Microphone access error:', err);
        setState('error');
        setTimeout(() => setState('idle'), 1000);
      }
    } else {
      recognitionRef.current?.start();
    }
  }, [isSupported, useMediaRecorder, onAudioRecorded, onTranscriptionChange]);

  const stopListening = useCallback(() => {
    if (useMediaRecorder) {
      mediaRecorderRef.current?.stop();
    } else {
      recognitionRef.current?.stop();
    }
    setState('idle');
  }, [useMediaRecorder]);

  const toggleListening = useCallback(() => {
    if (state === 'listening') {
      stopListening();
    } else if (state === 'idle') {
      startListening();
    }
  }, [state, startListening, stopListening]);

  const isDisabled = disabled || !isSupported || (useMediaRecorder && !onAudioRecorded);

  return (
    <Button
      type="button"
      size={size}
      variant={state === 'listening' ? 'default' : variant}
      className={cn(
        state === 'listening' && 'animate-pulse',
        className
      )}
      onClick={toggleListening}
      disabled={isDisabled}
      aria-label={state === 'listening' ? 'Stop listening' : 'Start voice input'}
    >
      {state === 'processing' ? (
        <Spinner />
      ) : state === 'listening' ? (
        <MicOffIcon className="size-4" />
      ) : (
        <MicIcon className="size-4" />
      )}
    </Button>
  );
}
