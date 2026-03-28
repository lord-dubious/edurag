import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('crawlAndVectorize deletion scope', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('scopes metadata.baseUrl deletions to the active thread', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
    const collection = { deleteMany };
    const addDocuments = vi.fn().mockResolvedValue(undefined);

    const crawl = vi.fn().mockResolvedValue({
      results: [
        {
          url: 'https://example.edu/admissions',
          rawContent: 'Admissions requirements and deadlines '.repeat(20),
        },
      ],
    });

    vi.doMock('@tavily/core', () => ({
      tavily: vi.fn(() => ({ crawl })),
    }));

    vi.doMock('@langchain/textsplitters', () => ({
      RecursiveCharacterTextSplitter: class {
        createDocuments = vi.fn().mockResolvedValue([
          {
            pageContent: 'This is a quality chunk with enough words and length to pass filtering.',
            metadata: {},
          },
        ]);
      },
    }));

    vi.doMock('@langchain/mongodb', () => ({
      MongoDBAtlasVectorSearch: class {
        addDocuments = addDocuments;
      },
    }));

    vi.doMock('@/lib/db/settings', () => ({
      getSettings: vi.fn().mockResolvedValue({ tavilyApiKey: 'test-tavily-key' }),
    }));

    vi.doMock('@/lib/vectorstore', () => ({
      getMongoCollection: vi.fn().mockResolvedValue(collection),
    }));

    vi.doMock('@/lib/providers', () => ({
      getEmbeddings: vi.fn().mockReturnValue({}),
    }));

    vi.doMock('@/lib/env', () => ({
      env: {
        VECTOR_COLLECTION: 'crawled_index',
        VECTOR_INDEX_NAME: 'index',
        CRAWL_MAX_DEPTH: 2,
        CRAWL_MAX_BREADTH: 20,
        CRAWL_LIMIT: 100,
        CRAWL_EXTRACT_DEPTH: 'advanced',
        CRAWL_INSTRUCTIONS: undefined,
        CRAWL_SELECT_PATHS: undefined,
        CRAWL_EXCLUDE_PATHS: undefined,
        CRAWL_ALLOW_EXTERNAL: false,
        CRAWL_FORMAT: 'markdown',
        TAVILY_API_KEY: '',
      },
    }));

    const { crawlAndVectorize } = await import('@/lib/crawl');

    await crawlAndVectorize({
      url: 'https://example.edu',
      threadId: 'thread-123',
    });

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      $or: [
        { threadId: 'thread-123' },
        { 'metadata.threadId': 'thread-123' },
        {
          $and: [
            { 'metadata.baseUrl': 'https://example.edu' },
            {
              $or: [
                { threadId: 'thread-123' },
                { 'metadata.threadId': 'thread-123' },
              ],
            },
          ],
        },
      ],
    });
  });
});
