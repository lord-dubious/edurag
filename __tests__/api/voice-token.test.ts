import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

type SessionValue = { user: { id: string } } | null;

const setupEnv = (overrides: Partial<NodeJS.ProcessEnv> = {}) => {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV, overrides);
};

const loadRoute = async ({
  session,
  rateLimitDoc,
  deepgramResult,
  deepgramError,
}: {
  session: SessionValue;
  rateLimitDoc?: unknown;
  deepgramResult?: { access_token: string; expires_in: number };
  deepgramError?: unknown;
}) => {
  const getSession = vi.fn().mockResolvedValue(session);
  const createIndex = vi.fn().mockResolvedValue(undefined);
  const findOneAndUpdate = vi.fn().mockResolvedValue(rateLimitDoc ?? {
    value: { _id: 'user-1', count: 1, createdAt: new Date() },
  });
  const collection = vi.fn().mockReturnValue({ createIndex, findOneAndUpdate });
  const db = vi.fn().mockReturnValue({ collection });
  const clientPromise = Promise.resolve({ db });
  const grantToken = vi.fn().mockResolvedValue({ result: deepgramResult, error: deepgramError });

  vi.doMock('@/lib/auth', () => ({ auth: { api: { getSession } } }));
  vi.doMock('@/lib/auth-client', () => ({ default: clientPromise }));
  vi.doMock('@deepgram/sdk', () => ({ createClient: () => ({ auth: { grantToken } }) }));
  vi.doMock('next/headers', () => ({ headers: async () => new Headers() }));

  const { GET } = await import('@/app/api/voice-token/route');
  return { GET, getSession, createIndex, findOneAndUpdate, grantToken };
};

describe('/api/voice-token', () => {
  beforeEach(() => {
    setupEnv({});
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await loadRoute({ session: null });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 500 when Deepgram key is missing', async () => {
    setupEnv({ NODE_ENV: 'test' });
    delete process.env.DEEPGRAM_API_KEY;
    const { GET } = await loadRoute({ session: { user: { id: 'user-1' } } });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 429 when rate limited', async () => {
    setupEnv({ NODE_ENV: 'test', DEEPGRAM_API_KEY: 'dg' });
    const { GET } = await loadRoute({
      session: { user: { id: 'user-1' } },
      rateLimitDoc: { value: { _id: 'user-1', count: 6, createdAt: new Date() } },
    });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(429);
    expect(body.code).toBe('RATE_LIMITED');
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('returns token and config on success', async () => {
    setupEnv({
      NODE_ENV: 'test',
      DEEPGRAM_API_KEY: 'dg',
      DEEPGRAM_TOKEN_TTL: '120',
      DEEPGRAM_STT_MODEL: 'nova-3',
      DEEPGRAM_TTS_MODEL: 'aura-2-thalia-en',
      DEEPGRAM_THINK_MODEL: 'gemini-2.5-flash',
    });
    const { GET, grantToken } = await loadRoute({
      session: { user: { id: 'user-1' } },
      deepgramResult: { access_token: 'token-123', expires_in: 120 },
    });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.token).toBe('token-123');
    expect(body.config).toEqual({
      sttModel: 'nova-3',
      ttsModel: 'aura-2-thalia-en',
      thinkModel: 'gemini-2.5-flash',
    });
    expect(grantToken).toHaveBeenCalledWith({ ttl_seconds: 120 });
  });
});
