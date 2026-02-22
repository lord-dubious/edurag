import { env } from '@/lib/env';

export type TTSProvider = 'deepgram' | 'openai';

export interface TTSConfig {
  provider: TTSProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
}

export function getTTSConfig(): TTSConfig | null {
  const provider = env.VOICE_TTS_PROVIDER;
  
  if (provider === 'deepgram' && env.DEEPGRAM_API_KEY) {
    return {
      provider: 'deepgram',
      apiKey: env.DEEPGRAM_API_KEY,
      model: env.VOICE_TTS_VOICE || 'aura-2-andromeda-en',
    };
  }
  
  if (env.VOICE_TTS_API_KEY) {
    return {
      provider: 'openai',
      apiKey: env.VOICE_TTS_API_KEY,
      baseUrl: env.VOICE_TTS_BASE_URL,
      model: env.VOICE_TTS_MODEL || 'tts-1',
    };
  }
  
  return null;
}

export function getDefaultVoiceModel(provider: TTSProvider): string {
  return provider === 'deepgram' ? 'aura-2-andromeda-en' : 'nova';
}
