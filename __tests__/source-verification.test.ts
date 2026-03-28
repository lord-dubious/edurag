import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getMongoCollection = vi.fn();

vi.mock('@/lib/vectorstore', () => ({
  getMongoCollection,
}));

describe('source verification', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('summarizes ok/dead links and content match correctly', async () => {
    const docs = [
      {
        text: 'Admissions deadlines for fall semester include october priority deadline and january final deadline for undergraduate students',
        metadata: {
          url: 'https://uni.example/admissions',
          title: 'Admissions',
          threadId: 'thread-1',
        },
      },
      {
        text: 'Tuition and fee information',
        metadata: {
          url: 'https://uni.example/tuition',
          title: 'Tuition',
          threadId: 'thread-1',
        },
      },
    ];

    const find = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(docs),
    });

    getMongoCollection.mockResolvedValue({
      find,
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(new Response('<html>Admissions deadlines for fall semester include october priority deadline and january final deadline for undergraduate students.</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 404 }));

    global.fetch = fetchMock as typeof fetch;

    const { verifyIndexedSources } = await import('@/lib/source-verification');
    const result = await verifyIndexedSources({
      threadId: 'thread-1',
      maxUrls: 10,
      concurrency: 1,
      timeoutMs: 5000,
    });

    expect(find).toHaveBeenCalledWith(
      {
        $or: [
          { threadId: 'thread-1' },
          { 'metadata.threadId': 'thread-1' },
        ],
      },
      expect.objectContaining({
        projection: expect.any(Object),
      }),
    );

    expect(result.summary.checkedSources).toBe(2);
    expect(result.summary.ok).toBe(1);
    expect(result.summary.dead).toBe(1);
    expect(result.summary.contentMatch).toBe(1);

    const admissions = result.results.find(r => r.url.includes('/admissions'));
    const tuition = result.results.find(r => r.url.includes('/tuition'));

    expect(admissions?.linkStatus).toBe('ok');
    expect(admissions?.contentStatus).toBe('match');
    expect(tuition?.linkStatus).toBe('dead');
    expect(tuition?.contentStatus).toBe('unknown');

  });

  it('marks restricted links from HEAD without GET fallback', async () => {
    const docs = [
      {
        text: 'Scholarships and aid',
        metadata: {
          url: 'https://uni.example/scholarships',
          title: 'Scholarships',
        },
      },
    ];

    const find = vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(docs),
    });

    getMongoCollection.mockResolvedValue({
      find,
    });

    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
    global.fetch = fetchMock as typeof fetch;

    const { verifyIndexedSources } = await import('@/lib/source-verification');
    const result = await verifyIndexedSources({
      maxUrls: 10,
      concurrency: 1,
      timeoutMs: 5000,
    });

    expect(result.summary.restricted).toBe(1);
    expect(result.results[0].linkStatus).toBe('restricted');
    expect(fetchMock).toHaveBeenCalledTimes(1);

  });
});
