import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

async function loadRoute({
  isAdmin,
  verificationResult,
}: {
  isAdmin: boolean;
  verificationResult?: {
    summary: Record<string, unknown>;
    results: Array<Record<string, unknown>>;
  };
}) {
  const verifyAdmin = vi.fn().mockReturnValue(isAdmin);
  const verifyIndexedSources = vi.fn().mockResolvedValue(
    verificationResult ?? {
      summary: { checkedSources: 0, dead: 0, errors: 0 },
      results: [],
    },
  );

  vi.doMock('@/lib/admin-auth', () => ({ verifyAdmin }));
  vi.doMock('@/lib/source-verification', () => ({ verifyIndexedSources }));

  const { POST } = await import('@/app/api/domains/verify/route');
  return { POST, verifyAdmin, verifyIndexedSources };
}

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/domains/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildRawRequest(rawBody: string) {
  return new NextRequest('http://localhost/api/domains/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

describe('POST /api/domains/verify', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns 401 when unauthorized', async () => {
    const { POST, verifyIndexedSources } = await loadRoute({ isAdmin: false });
    const response = await POST(buildRequest({ threadId: 'thread-1' }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe('UNAUTHORIZED');
    expect(verifyIndexedSources).not.toHaveBeenCalled();
  });

  it('returns verification payload on success', async () => {
    const { POST, verifyIndexedSources } = await loadRoute({
      isAdmin: true,
      verificationResult: {
        summary: {
          checkedSources: 2,
          dead: 1,
          errors: 0,
          contentMismatch: 0,
        },
        results: [
          { url: 'https://uni.example/admissions', linkStatus: 'ok' },
          { url: 'https://uni.example/old-page', linkStatus: 'dead' },
        ],
      },
    });

    const response = await POST(buildRequest({
      threadId: 'thread-1',
      maxUrls: '25',
      timeoutMs: '6000',
      concurrency: '4',
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.summary.checkedSources).toBe(2);
    expect(body.results).toHaveLength(2);
    expect(verifyIndexedSources).toHaveBeenCalledWith({
      threadId: 'thread-1',
      maxUrls: 25,
      timeoutMs: 6000,
      concurrency: 4,
    });
  });

  it('returns 400 for malformed JSON body', async () => {
    const { POST, verifyIndexedSources } = await loadRoute({ isAdmin: true });
    const response = await POST(buildRawRequest('{"threadId":'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(verifyIndexedSources).not.toHaveBeenCalled();
  });
});
