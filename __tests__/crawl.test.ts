import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import { crawlAndVectorize, deleteCrawlData } from '../lib/crawl';
import { env } from '../lib/env';

const TEST_THREAD_ID = 'test-crawl-thread-' + Date.now();
const TEST_URL = 'https://docs.anthropic.com';

describe('Crawl Pipeline', () => {
  let client: MongoClient;

  beforeAll(async () => {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
  });

  afterAll(async () => {
    await deleteCrawlData(TEST_THREAD_ID);
    await client.close();
  });

  it('should crawl a URL and vectorize content', async () => {
    const progressEvents: Array<{ page: number; total: number }> = [];
    
    const docCount = await crawlAndVectorize({
      url: TEST_URL,
      threadId: TEST_THREAD_ID,
      maxDepth: 1,
      maxBreadth: 5,
      limit: 5,
      onProgress: (page, total) => {
        progressEvents.push({ page, total });
      },
    });

    console.log(`Crawled and indexed ${docCount} documents`);
    expect(docCount).toBeGreaterThan(0);
    expect(progressEvents.length).toBeGreaterThan(0);
  }, 120000);

  it('should store documents with correct metadata', async () => {
    const db = client.db(env.DB_NAME);
    const collection = db.collection(env.VECTOR_COLLECTION);
    
    const docs = await collection
      .find({ threadId: TEST_THREAD_ID })
      .toArray();

    expect(docs.length).toBeGreaterThan(0);
    
    const firstDoc = docs[0];
    expect(firstDoc).toHaveProperty('text');
    expect(firstDoc).toHaveProperty('embedding');
    expect(firstDoc).toHaveProperty('url');
    expect(firstDoc).toHaveProperty('threadId', TEST_THREAD_ID);
  });

  it('should delete crawl data by thread ID', async () => {
    const deletedCount = await deleteCrawlData(TEST_THREAD_ID);
    console.log(`Deleted ${deletedCount} documents`);
    expect(deletedCount).toBeGreaterThan(0);
  });
});
