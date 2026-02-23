import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/voice/models/route';
import { NextRequest } from 'next/server';

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

function createRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/voice/models', {
    headers: new Headers(headers),
  });
}

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
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      models: { getAll: mockGetAll },
    });

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models).toHaveLength(2);
    expect(data.models[0].name).toBe('aura-2-andromeda-en');
  });

  it('returns empty models when no API key is available', async () => {
    const { env } = await import('@/lib/env');
    (env as unknown as Record<string, unknown>).DEEPGRAM_API_KEY = undefined;

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.models).toEqual([]);
  });

  it('uses header API key when provided', async () => {
    const { createClient } = await import('@deepgram/sdk');
    const mockGetAll = vi.fn().mockResolvedValue({
      result: { tts: [{ name: 'test-model', canonical_name: 'Test', languages: ['en'] }] },
      error: null,
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      models: { getAll: mockGetAll },
    });

    await GET(createRequest({ 'X-Deepgram-Key': 'header-key' }));

    expect(createClient).toHaveBeenCalledWith('header-key');
  });

  it('handles Deepgram API errors gracefully', async () => {
    const { createClient } = await import('@deepgram/sdk');
    const mockGetAll = vi.fn().mockResolvedValue({
      result: null,
      error: { message: 'API error' },
    });
    (createClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      models: { getAll: mockGetAll },
    });

    const { env } = await import('@/lib/env');
    (env as unknown as Record<string, unknown>).DEEPGRAM_API_KEY = 'test-key';

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
  });
});
