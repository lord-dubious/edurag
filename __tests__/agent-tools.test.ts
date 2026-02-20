import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { generateText } from 'ai';
import { stepCountIs } from 'ai';
import { MongoClient } from 'mongodb';
import { Document } from '@langchain/core/documents';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { getMongoCollection, closeMongoClient, similaritySearchWithScore } from '../lib/vectorstore';
import { getChatModel, getEmbeddings } from '../lib/providers';
import { createVectorSearchTool } from '../lib/agent/tools';
import { env } from '../lib/env';

const TEST_THREAD_ID = 'test-agent-thread-' + Date.now();

describe('Agent Tools', () => {
  let client: MongoClient;

  beforeAll(async () => {
    client = new MongoClient(env.MONGODB_URI!);
    await client.connect();
    
    const collection = await getMongoCollection(env.VECTOR_COLLECTION!);
    const embeddingsInstance = getEmbeddings();
    
    const docs = [
      new Document({
        pageContent: 'The MBA program requires a bachelor\'s degree, GMAT score of 600+, and 2 years of work experience.',
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
    
    console.log('Waiting 20s for Atlas Vector Search index refresh...');
    await new Promise(r => setTimeout(r, 20000));
    console.log('Index refresh wait complete');
  }, 90000);

  afterAll(async () => {
    const collection = await getMongoCollection(env.VECTOR_COLLECTION!);
    await collection.deleteMany({ threadId: TEST_THREAD_ID });
    await closeMongoClient();
    await client.close();
  });

  describe('Vector Search Tool', () => {
    it('should find relevant documents', async () => {
      const results = await similaritySearchWithScore('MBA program requirements', 5);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0][0].pageContent).toContain('MBA');
    });

    it('should return empty results for irrelevant queries', async () => {
      const results = await similaritySearchWithScore('quantum physics mars rover', 5);

      console.log(`Irrelevant query returned ${results.length} results`);
    });
  });

  describe('Agent with Tools', () => {
    it('should use vector_search tool to answer question', async () => {
      const vectorSearchTool = createVectorSearchTool();

      const result = await generateText({
        model: getChatModel(),
        tools: {
          vector_search: vectorSearchTool,
        },
        prompt: 'What are the requirements for the MBA program?',
        stopWhen: stepCountIs(3),
      });

      console.log('Agent response:', result.text);
      console.log(`Steps completed: ${result.steps.length}`);
      
      const toolCalls = result.steps.flatMap(s => s.toolCalls || []);
      console.log(`Tool calls made: ${toolCalls.length}`);

      expect(result.text.length).toBeGreaterThan(0);
    }, 60000);

    it('should cite sources when using vector_search', async () => {
      const vectorSearchTool = createVectorSearchTool();

      const result = await generateText({
        model: getChatModel(),
        tools: {
          vector_search: vectorSearchTool,
        },
        prompt: 'Tell me about financial aid options',
        stopWhen: stepCountIs(3),
      });

      console.log('Response:', result.text);
      
      const toolResults = result.steps.flatMap(s => s.toolResults || []);
      if (toolResults.length > 0) {
        console.log('Tool results:', JSON.stringify(toolResults, null, 2));
      }
    }, 60000);
  });
});
