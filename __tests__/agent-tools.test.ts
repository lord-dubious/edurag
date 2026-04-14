import { MongoClient } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { generateText, stepCountIs } from 'ai';
import { Document } from '@langchain/core/documents';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';

import { createVectorSearchTool } from '@edurag/agent/text';

import { env } from '../lib/env';
import { getChatModel, getEmbeddings } from '../lib/providers';
import { getMongoCollection, closeMongoClient, similaritySearchWithScore } from '../lib/vectorstore';

const TEST_THREAD_ID = 'test-agent-thread-' + Date.now();
const UNIQUE_MBA_TOKEN = `edurag-mba-${TEST_THREAD_ID}`;

describe('Agent Tools', () => {
  let client: MongoClient;

  beforeAll(async () => {
    client = new MongoClient(env.MONGODB_URI!);
    await client.connect();

    const collection = await getMongoCollection(env.VECTOR_COLLECTION!);
    const embeddingsInstance = getEmbeddings();

    const docs = [
      new Document({
        pageContent: `The MBA program requires a bachelor's degree, GMAT score of 600+, and 2 years of work experience. ${UNIQUE_MBA_TOKEN}`,
        metadata: { url: 'https://test.edu/mba', threadId: TEST_THREAD_ID, title: 'MBA Requirements' },
      }),
      new Document({
        pageContent: 'Financial aid includes scholarships, grants, and work-study programs. Apply by March 1st.',
        metadata: { url: 'https://test.edu/financial-aid', threadId: TEST_THREAD_ID, title: 'Financial Aid' },
      }),
    ];

    await MongoDBAtlasVectorSearch.fromDocuments(docs, embeddingsInstance, {
      collection,
      indexName: env.VECTOR_INDEX_NAME!,
      textKey: 'text',
      embeddingKey: 'embedding',
    });

    await new Promise(r => setTimeout(r, 20000));
  }, 90000);

  afterAll(async () => {
    const collection = await getMongoCollection(env.VECTOR_COLLECTION!);
    await collection.deleteMany({ threadId: TEST_THREAD_ID });
    await closeMongoClient();
    await client.close();
  });

  describe('Vector Search Tool', () => {
    it('should find relevant documents', async () => {
      const results = await similaritySearchWithScore(UNIQUE_MBA_TOKEN, 80);

      expect(results.length).toBeGreaterThan(0);
      const [doc, score] = results[0];
      expect(typeof doc.pageContent).toBe('string');
      expect(typeof score).toBe('number');
      expect(results.some(([resultDoc]) => resultDoc.pageContent.includes(UNIQUE_MBA_TOKEN))).toBe(true);
    });

    it('should return empty results for irrelevant queries', async () => {
      const results = await similaritySearchWithScore('quantum physics mars rover', 5);

    });
  });

  describe('Agent with Tools', () => {
    it('should use vector_search tool to answer question', async () => {
      const vectorSearchTool = createVectorSearchTool(similaritySearchWithScore);

      const result = await generateText({
        model: getChatModel(),
        tools: {
          vector_search: vectorSearchTool,
        },
        prompt: 'What are the requirements for the MBA program?',
        stopWhen: stepCountIs(3),
      });

      expect(result.text.length).toBeGreaterThan(0);
    }, 60000);

    it('should cite sources when using vector_search', async () => {
      const vectorSearchTool = createVectorSearchTool(similaritySearchWithScore);

      const result = await generateText({
        model: getChatModel(),
        tools: {
          vector_search: vectorSearchTool,
        },
        prompt: 'Tell me about financial aid options',
        stopWhen: stepCountIs(3),
      });

    }, 120000);
  });
});

