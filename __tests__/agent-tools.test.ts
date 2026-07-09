import { MongoClient } from 'mongodb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { Document } from '@langchain/core/documents';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';

import { createVectorSearchTool } from '@edurag/agent/text';
import type { ToolResult } from '@edurag/agent/text';

import { env } from '../lib/env';
import { getEmbeddings } from '../lib/providers';
import { getMongoCollection, closeMongoClient, similaritySearchWithScore } from '../lib/vectorstore';

const TEST_THREAD_ID = 'test-agent-thread-' + Date.now();
const UNIQUE_MBA_TOKEN = `edurag-mba-${TEST_THREAD_ID}`;

interface ExecutableVectorSearchTool {
  execute: (
    input: { query: string; topK?: number },
    options: { toolCallId: string },
  ) => Promise<ToolResult> | ToolResult;
}

function asExecutableVectorSearchTool(tool: unknown): ExecutableVectorSearchTool {
  if (typeof tool === 'object' && tool !== null && 'execute' in tool && typeof tool.execute === 'function') {
    return tool as ExecutableVectorSearchTool;
  }

  throw new Error('vector_search tool is missing an execute function');
}

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
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Agent with Tools', () => {
    it('should expose executable vector_search results for agent use', async () => {
      const vectorSearchTool = asExecutableVectorSearchTool(createVectorSearchTool(similaritySearchWithScore));

      const result = await vectorSearchTool.execute(
        { query: UNIQUE_MBA_TOKEN, topK: 6 },
        { toolCallId: 'test-vector-search' },
      );

      expect(result.found).toBe(true);
      expect(result.results.some(source => source.content.includes(UNIQUE_MBA_TOKEN))).toBe(true);
    }, 60000);

    it('should return citation instructions with vector_search results', async () => {
      const vectorSearchTool = asExecutableVectorSearchTool(createVectorSearchTool(similaritySearchWithScore));

      const result = await vectorSearchTool.execute(
        { query: 'financial aid scholarships grants work-study', topK: 6 },
        { toolCallId: 'test-vector-search-citations' },
      );

      expect(result.found).toBe(true);
      expect(result.instruction).toContain('(cite:1)');
      expect(result.results.some(source => source.url === 'https://test.edu/financial-aid')).toBe(true);
    }, 120000);
  });
});

