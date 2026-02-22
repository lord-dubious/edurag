export type AgentState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type VoiceEvent =
  | { type: 'transcript'; text: string; isFinal: boolean }
  | { type: 'agent_audio'; audio: string }
  | { type: 'agent_state'; state: AgentState }
  | { type: 'error'; message: string }
  | { type: 'user_stopped_speaking' };

export interface VoiceSessionConfig {
  deepgramApiKey: string;
  model?: string;
  language?: string;
  sampleRate?: number;
}

export const DEFAULT_VOICE_CONFIG: Required<Omit<VoiceSessionConfig, 'deepgramApiKey'>> = {
  model: 'nova-3',
  language: 'en-US',
  sampleRate: 16000,
};
