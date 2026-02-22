import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/voice/models/route';

vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn(() => ({
    models: {
      getAll: vi.fn(),
    },
  })),
}));

vi.mock('@/lib/env', () => ({
  env: {
    DEEPGRAM_API_KEY: 'test-key',
  },
}));

describe('GET /api/voice/models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns list of TTS models', async () => {
    const { createClient } = await import('@deepgram/sdk');
    const mockGetAll = vi.fn().mockResolvedValue({
      result: {
        tts: [
          { name: 'aura-2-andromeda-en', canonical_name: 'Andromeda voice', languages: ['en'] },
          { name: 'aura-2-thalia-en', canonical_name: 'Thalia voice', languages: ['en'] },
        ],
      },
      error: null,
    });
    (createClient as any).mockReturnValue({
      models: { getAll: mockGetAll },
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models).toHaveLength(2);
    expect(data.models[0].name).toBe('aura-2-andromeda-en');
  });

  it('returns 400 when DEEPGRAM_API_KEY is not set', async () => {
    const { env } = await import('@/lib/env');
    (env as any).DEEPGRAM_API_KEY = undefined;

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('DEEPGRAM_API_KEY');
  });

  it('handles Deepgram API errors gracefully', async () => {
    const { createClient } = await import('@deepgram/sdk');
    const mockGetAll = vi.fn().mockResolvedValue({
      result: null,
      error: { message: 'API error' },
    });
    (createClient as any).mockReturnValue({
      models: { getAll: mockGetAll },
    });

    const { env } = await import('@/lib/env');
    (env as any).DEEPGRAM_API_KEY = 'test-key';

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
