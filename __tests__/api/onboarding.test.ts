import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db/settings', () => ({
  updateSettings: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('@/lib/providers', () => ({
  getEmbeddings: vi.fn(() => ({
    embedDocuments: vi.fn().mockResolvedValue([[]]),
  })),
}));

vi.mock('@/lib/vectorstore', () => ({
  getMongoCollection: vi.fn().mockResolvedValue({
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    find: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
  }),
}));

import { updateSettings, getSettings } from '@/lib/db/settings';

const mockUpdateSettings = vi.mocked(updateSettings);
const mockGetSettings = vi.mocked(getSettings);

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/onboarding/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/onboarding/detect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates and normalizes URL', async () => {
    const { POST } = await import('@/app/api/onboarding/detect/route');
    const req = createRequest({ url: 'example.edu' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toBe('https://example.edu');
    expect(data.domain).toBe('example.edu');
  });

  it('returns 400 for missing URL', async () => {
    const { POST } = await import('@/app/api/onboarding/detect/route');
    const req = createRequest({});
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid URL without TLD', async () => {
    const { POST } = await import('@/app/api/onboarding/detect/route');
    const req = createRequest({ url: 'localhost' });
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('handles already normalized URLs', async () => {
    const { POST } = await import('@/app/api/onboarding/detect/route');
    const req = createRequest({ url: 'https://example.edu' });
    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBe('https://example.edu');
  });
});

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettings.mockResolvedValue(undefined);
  });

  it('saves onboarding settings', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const req = createRequest({
      universityUrl: 'https://example.edu',
      universityName: 'Example University',
      brandPrimary: '#1e407c',
      brandSecondary: '#1e3a8a',
      emoji: '🎓',
      iconType: 'emoji',
      excludePaths: [],
      fileTypeRules: { pdf: 'index', docx: 'index', csv: 'skip' },
      apiKeys: {
        mongodbUri: 'mongodb+srv://test',
        chatApiKey: 'test-key',
        chatBaseUrl: 'https://api.cerebras.ai/v1',
        chatModel: 'llama-3.3-70b',
        embeddingApiKey: 'test-key',
        embeddingModel: 'voyage-4-large',
        embeddingDimensions: 2048,
        tavilyApiKey: 'test-key',
        adminSecret: 'test-secret',
      },
    });

    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockUpdateSettings).toHaveBeenCalled();
  });

  it('returns 400 for missing mongodbUri', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const req = createRequest({
      universityUrl: 'https://example.edu',
      universityName: 'Example University',
      brandPrimary: '#1e407c',
      apiKeys: {
        chatApiKey: 'test-key',
        embeddingApiKey: 'test-key',
        tavilyApiKey: 'test-key',
        adminSecret: 'test-secret',
      },
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing chatApiKey', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const req = createRequest({
      universityUrl: 'https://example.edu',
      universityName: 'Example University',
      brandPrimary: '#1e407c',
      apiKeys: {
        mongodbUri: 'mongodb+srv://test',
        embeddingApiKey: 'test-key',
        tavilyApiKey: 'test-key',
        adminSecret: 'test-secret',
      },
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing university URL', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const req = createRequest({
      brandPrimary: '#1e407c',
      universityName: 'Example University',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing brand primary', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const req = createRequest({
      universityUrl: 'https://example.edu',
      universityName: 'Example University',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it('returns 400 for missing university name', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const req = createRequest({
      universityUrl: 'https://example.edu',
      brandPrimary: '#1e407c',
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
  });
});

describe('GET /api/onboarding/complete (status)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns onboarding status', async () => {
    mockGetSettings.mockResolvedValueOnce({
      _id: 'onboarding',
      onboarded: true,
      uniUrl: 'https://example.edu',
      brandPrimary: '#1e407c',
      appName: 'Example University',
    });

    const { GET } = await import('@/app/api/onboarding/complete/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isOnboarded).toBe(true);
    expect(data.uniUrl).toBe('https://example.edu');
  });

  it('returns not onboarded status', async () => {
    mockGetSettings.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/onboarding/complete/route');
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.isOnboarded).toBe(false);
  });
});
