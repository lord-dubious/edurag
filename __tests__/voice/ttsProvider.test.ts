import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTTSConfig, getDefaultVoiceModel } from '@/lib/voice/ttsProvider';
import type { TTSProvider } from '@/lib/voice/ttsProvider';

vi.mock('@/lib/env', () => ({
  env: {
    DEEPGRAM_API_KEY: undefined as string | undefined,
    VOICE_TTS_PROVIDER: 'deepgram' as TTSProvider,
    VOICE_TTS_API_KEY: undefined as string | undefined,
    VOICE_TTS_BASE_URL: 'https://api.openai.com/v1',
    VOICE_TTS_MODEL: 'tts-1',
    VOICE_TTS_VOICE: 'aura-2-andromeda-en',
  },
}));

describe('getTTSConfig', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns Deepgram config when DEEPGRAM_API_KEY is set and provider is deepgram', async () => {
    const { env } = await import('@/lib/env');
    (env as any).DEEPGRAM_API_KEY = 'test-deepgram-key';
    (env as any).VOICE_TTS_PROVIDER = 'deepgram';

    const config = getTTSConfig();

    expect(config).not.toBeNull();
    expect(config?.provider).toBe('deepgram');
    expect(config?.apiKey).toBe('test-deepgram-key');
    expect(config?.model).toBe('aura-2-andromeda-en');
  });

  it('returns OpenAI config when VOICE_TTS_API_KEY is set and provider is openai', async () => {
    const { env } = await import('@/lib/env');
    (env as any).DEEPGRAM_API_KEY = undefined;
    (env as any).VOICE_TTS_PROVIDER = 'openai';
    (env as any).VOICE_TTS_API_KEY = 'test-openai-key';
    (env as any).VOICE_TTS_BASE_URL = 'https://custom.api.com/v1';

    const config = getTTSConfig();

    expect(config).not.toBeNull();
    expect(config?.provider).toBe('openai');
    expect(config?.apiKey).toBe('test-openai-key');
    expect(config?.baseUrl).toBe('https://custom.api.com/v1');
  });

  it('returns null when no API keys are configured', async () => {
    const { env } = await import('@/lib/env');
    (env as any).DEEPGRAM_API_KEY = undefined;
    (env as any).VOICE_TTS_API_KEY = undefined;

    const config = getTTSConfig();

    expect(config).toBeNull();
  });

  it('prefers Deepgram over OpenAI when both keys are set', async () => {
    const { env } = await import('@/lib/env');
    (env as any).DEEPGRAM_API_KEY = 'deepgram-key';
    (env as any).VOICE_TTS_API_KEY = 'openai-key';
    (env as any).VOICE_TTS_PROVIDER = 'deepgram';

    const config = getTTSConfig();

    expect(config?.provider).toBe('deepgram');
  });
});

describe('getDefaultVoiceModel', () => {
  it('returns aura-2-andromeda-en for Deepgram', () => {
    expect(getDefaultVoiceModel('deepgram')).toBe('aura-2-andromeda-en');
  });

  it('returns nova for OpenAI', () => {
    expect(getDefaultVoiceModel('openai')).toBe('nova');
  });
});
