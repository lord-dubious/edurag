'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Persona, type PersonaState } from '@/components/ai-elements/persona';
import {
  MicSelector,
  MicSelectorTrigger,
  MicSelectorContent,
  MicSelectorInput,
  MicSelectorList,
  MicSelectorEmpty,
  MicSelectorItem,
  MicSelectorLabel,
  MicSelectorValue,
  useAudioDevices,
} from '@/components/ai-elements/mic-selector';
import {
  VoiceSelector,
  VoiceSelectorTrigger,
  VoiceSelectorContent,
  VoiceSelectorInput,
  VoiceSelectorList,
  VoiceSelectorEmpty,
  VoiceSelectorItem,
  VoiceSelectorName,
  VoiceSelectorPreview,
  VoiceSelectorAttributes,
  VoiceSelectorBullet,
  VoiceSelectorGender,
  useVoiceSelector,
} from '@/components/ai-elements/voice-selector';
import { Phone, PhoneOff, Settings2 } from 'lucide-react';

interface VoiceCallProps {
  onEnd?: () => void;
}

interface VoiceEvent {
  type: string;
  state?: 'idle' | 'listening' | 'thinking' | 'speaking';
  audio?: string;
  transcript?: string;
  response?: string;
  error?: string;
}

interface VoiceModel {
  id: string;
  name: string;
  gender?: string;
  accent?: string;
  language?: string;
}

function VoiceSelectionDialog({ onVoiceSelect }: { onVoiceSelect: (voiceId: string) => void }) {
  const [voices, setVoices] = useState<VoiceModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { value, setValue, open, setOpen } = useVoiceSelector();

  useEffect(() => {
    if (open && voices.length === 0) {
      setLoading(true);
      fetch('/api/voice/models')
        .then((res) => res.json())
        .then((data) => {
          setVoices(data.voices || []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, voices.length]);

  const handleVoiceSelect = (voiceId: string) => {
    setValue(voiceId);
    onVoiceSelect(voiceId);
    setOpen(false);
  };

  const handlePreview = async (voiceId: string) => {
    setPlayingId(voiceId);
    setTimeout(() => setPlayingId(null), 2000);
  };

  return (
    <>
      <VoiceSelectorTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          <span className="hidden sm:inline">Voice</span>
        </Button>
      </VoiceSelectorTrigger>
      <VoiceSelectorContent>
        <VoiceSelectorInput placeholder="Search voices..." />
        <VoiceSelectorList>
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading voices...</div>
          ) : (
            <VoiceSelectorEmpty>No voices found.</VoiceSelectorEmpty>
          )}
          {voices.map((voice) => (
            <VoiceSelectorItem
              key={voice.id}
              value={voice.id}
              onSelect={() => handleVoiceSelect(voice.id)}
            >
              <div className="flex items-center gap-2 w-full">
                <VoiceSelectorName>{voice.name}</VoiceSelectorName>
                <VoiceSelectorAttributes>
                  {voice.gender && (
                    <>
                      <VoiceSelectorGender value={voice.gender as 'male' | 'female'} />
                      <VoiceSelectorBullet />
                    </>
                  )}
                  {voice.accent && (
                    <span className="text-muted-foreground text-xs">{voice.accent}</span>
                  )}
                </VoiceSelectorAttributes>
                <VoiceSelectorPreview
                  playing={playingId === voice.id}
                  onPlay={() => handlePreview(voice.id)}
                  className="ml-auto"
                />
              </div>
            </VoiceSelectorItem>
          ))}
        </VoiceSelectorList>
      </VoiceSelectorContent>
    </>
  );
}

export default function VoiceCall({ onEnd }: VoiceCallProps) {
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [agentState, setAgentState] = useState<PersonaState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedMic, setSelectedMic] = useState<string | undefined>();
  const [selectedVoice, setSelectedVoice] = useState<string | undefined>();
  const [showSetup, setShowSetup] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const micAudioContextRef = useRef<AudioContext | null>(null);
  const speakerAudioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioWorkletNodeRef = useRef<AudioWorkletNode | null>(null);
  const activeSourceNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const agentStateRef = useRef<PersonaState>('idle');

  const float32ToInt16 = (float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  };

  const int16ArrayToBase64 = (int16Array: Int16Array): string => {
    const bytes = new Uint8Array(int16Array.buffer, int16Array.byteOffset, int16Array.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const base64ToInt16Array = (base64: string): Int16Array => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Int16Array(bytes.buffer);
  };

  const playAudio = useCallback((base64Audio: string) => {
    if (!speakerAudioContextRef.current) return;

    const audioContext = speakerAudioContextRef.current;
    const int16Data = base64ToInt16Array(base64Audio);
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7fff);
    }

    const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      activeSourceNodesRef.current.delete(source);
    };

    activeSourceNodesRef.current.add(source);
    source.start();
  }, []);

  const cleanup = useCallback(() => {
    activeSourceNodesRef.current.forEach((source) => {
      try {
        source.stop();
      } catch {
      }
    });
    activeSourceNodesRef.current.clear();

    timeoutsRef.current.forEach((timeout) => {
      clearTimeout(timeout);
    });
    timeoutsRef.current.clear();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (micAudioContextRef.current) {
      micAudioContextRef.current.close().catch(() => {});
      micAudioContextRef.current = null;
    }

    if (speakerAudioContextRef.current) {
      speakerAudioContextRef.current.close().catch(() => {});
      speakerAudioContextRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setConnectionState('disconnected');
    setAgentState('idle');
    agentStateRef.current = 'idle';
  }, []);

  const handleEndCall = useCallback(() => {
    cleanup();
    onEnd?.();
  }, [cleanup, onEnd]);

  const startCall = useCallback(async () => {
    setConnectionState('connecting');
    setErrorMessage(null);
    setTranscript('');
    setResponse('');
    setShowSetup(false);

    try {
      const micAudioContext = new AudioContext({ sampleRate: 16000 });
      micAudioContextRef.current = micAudioContext;

      const speakerAudioContext = new AudioContext({ sampleRate: 24000 });
      speakerAudioContextRef.current = speakerAudioContext;

      await micAudioContext.audioWorklet.addModule('/pcm-processor.js');

      const constraints: MediaStreamConstraints = {
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const source = micAudioContext.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(micAudioContext, 'pcm-processor');
      audioWorkletNodeRef.current = workletNode;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/voice`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setConnectionState('connected');
        source.connect(workletNode);
        
        if (selectedVoice) {
          const voiceMsg = JSON.stringify({ type: 'voice_config', voice: selectedVoice });
          const encoder = new TextEncoder();
          const msgBytes = encoder.encode(voiceMsg);
          const binaryMsg = new Uint8Array(1 + msgBytes.length);
          binaryMsg[0] = 0x01;
          binaryMsg.set(msgBytes, 1);
          ws.send(binaryMsg);
        }
      };

      ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;

        const data = new Uint8Array(event.data);
        const type = data[0];
        const payload = new TextDecoder().decode(data.slice(1));

        if (type === 0x01) {
          try {
            const voiceEvent: VoiceEvent = JSON.parse(payload);

            if (voiceEvent.state) {
              setAgentState(voiceEvent.state);
              agentStateRef.current = voiceEvent.state;
            }

            if (voiceEvent.audio) {
              playAudio(voiceEvent.audio);
            }

            if (voiceEvent.transcript) {
              setTranscript((prev) => prev + voiceEvent.transcript);
            }

            if (voiceEvent.response) {
              setResponse((prev) => prev + voiceEvent.response);
            }

            if (voiceEvent.error) {
              setErrorMessage(voiceEvent.error);
              setConnectionState('error');
            }
          } catch {
          }
        }
      };

      ws.onerror = () => {
        setErrorMessage('WebSocket connection error');
        setConnectionState('error');
      };

      ws.onclose = () => {
        setConnectionState('disconnected');
      };

      workletNode.port.onmessage = (event) => {
        if (
          ws.readyState === WebSocket.OPEN &&
          event.data instanceof Float32Array &&
          agentStateRef.current !== 'speaking'
        ) {
          const int16Data = float32ToInt16(event.data);
          const base64Audio = int16ArrayToBase64(int16Data);

          const message = JSON.stringify({ type: 'audio', data: base64Audio });
          const encoder = new TextEncoder();
          const messageBytes = encoder.encode(message);
          const binaryMessage = new Uint8Array(1 + messageBytes.length);
          binaryMessage[0] = 0x01;
          binaryMessage.set(messageBytes, 1);

          ws.send(binaryMessage);
        }
      };
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to start call');
      setConnectionState('error');
      cleanup();
    }
  }, [cleanup, playAudio, selectedMic, selectedVoice]);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto p-4 gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getConnectionStatusColor()}`} />
          <span className="text-xs text-muted-foreground capitalize">{connectionState}</span>
        </div>
        <VoiceSelector value={selectedVoice} onValueChange={setSelectedVoice}>
          <VoiceSelectionDialog onVoiceSelect={setSelectedVoice} />
        </VoiceSelector>
      </div>

      {errorMessage && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">{errorMessage}</p>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <Persona state={agentState} className="w-24 h-24" variant="obsidian" />

        <div className="text-center">
          <p className="text-sm font-medium capitalize">{agentState}</p>
          <p className="text-xs text-muted-foreground">
            {connectionState === 'connected'
              ? agentState === 'listening'
                ? 'Speak now...'
                : agentState === 'thinking'
                ? 'Thinking...'
                : agentState === 'speaking'
                ? 'Speaking...'
                : 'Ready'
              : 'Start a voice call'}
          </p>
        </div>
      </div>

      {(transcript || response) && (
        <Card className="max-h-40 overflow-y-auto">
          <CardContent className="p-3 space-y-2">
            {transcript && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">You:</p>
                <p className="text-sm">{transcript}</p>
              </div>
            )}
            {response && (
              <div>
                <p className="text-xs text-primary mb-1">Assistant:</p>
                <p className="text-sm">{response}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showSetup && connectionState === 'disconnected' && (
        <MicSelector value={selectedMic} onValueChange={setSelectedMic}>
          <div className="flex flex-col gap-3 w-full">
            <div className="flex items-center gap-2">
              <MicSelectorTrigger className="flex-1 justify-start">
                <MicSelectorValue />
              </MicSelectorTrigger>
            </div>
            <MicSelectorContent>
              <MicSelectorInput />
              <MicSelectorList>
                {(devices) =>
                  devices.length === 0 ? (
                    <MicSelectorEmpty>No microphones found</MicSelectorEmpty>
                  ) : (
                    devices.map((device) => (
                      <MicSelectorItem key={device.deviceId} value={device.deviceId}>
                        <MicSelectorLabel device={device} />
                      </MicSelectorItem>
                    ))
                  )
                }
              </MicSelectorList>
            </MicSelectorContent>
          </div>
        </MicSelector>
      )}

      <div className="flex justify-center gap-2">
        {connectionState === 'disconnected' || connectionState === 'error' ? (
          <Button onClick={startCall} size="lg" className="gap-2 rounded-full">
            <Phone className="w-5 h-5" />
            Start Call
          </Button>
        ) : (
          <Button onClick={handleEndCall} variant="destructive" size="lg" className="gap-2 rounded-full">
            <PhoneOff className="w-5 h-5" />
            End Call
          </Button>
        )}
      </div>
    </div>
  );
}
