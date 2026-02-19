import { tavily } from '@tavily/core';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { env } from './env';
import { embeddings } from './providers';
import { getMongoCollection } from './vectorstore';

interface CrawlOptions {
  url: string;
  threadId: string;
  maxDepth?: number;
  maxBreadth?: number;
  limit?: number;
  extractDepth?: 'basic' | 'advanced';
  instructions?: string;
  selectPaths?: string[];
  excludePaths?: string[];
  allowExternal?: boolean;
  format?: 'markdown' | 'text';
  onProgress?: (page: number, total: number) => void;
}

export async function crawlAndVectorize(opts: CrawlOptions): Promise<number> {
  const client = tavily({ apiKey: env.TAVILY_API_KEY });

  const selectPaths = opts.selectPaths
    ?? env.CRAWL_SELECT_PATHS?.split(',').map(p => p.trim()).filter(Boolean);
  const excludePaths = opts.excludePaths
    ?? env.CRAWL_EXCLUDE_PATHS?.split(',').map(p => p.trim()).filter(Boolean);

  const crawlResponse = await client.crawl(opts.url, {
    maxDepth: opts.maxDepth ?? env.CRAWL_MAX_DEPTH,
    maxBreadth: opts.maxBreadth ?? env.CRAWL_MAX_BREADTH,
    limit: opts.limit ?? env.CRAWL_LIMIT,
    extractDepth: opts.extractDepth ?? env.CRAWL_EXTRACT_DEPTH,
    instructions: opts.instructions ?? env.CRAWL_INSTRUCTIONS,
    selectPaths: selectPaths?.length ? selectPaths : undefined,
    excludePaths: excludePaths?.length ? excludePaths : undefined,
    allowExternal: opts.allowExternal ?? env.CRAWL_ALLOW_EXTERNAL,
    format: opts.format ?? env.CRAWL_FORMAT,
  });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const documents: Document[] = [];
  const total = crawlResponse.results.length;

  for (let i = 0; i < total; i++) {
    const result = crawlResponse.results[i];
    opts.onProgress?.(i + 1, total);

    const urlObj = new URL(result.url);
    const title = urlObj.pathname.split('/').filter(Boolean).pop() ?? urlObj.hostname;
    const chunks = await splitter.createDocuments([result.rawContent], [{
      url: result.url,
      title,
      threadId: opts.threadId,
      baseUrl: opts.url,
      timestamp: new Date().toISOString(),
    }]);
    documents.push(...chunks);
  }

  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
    collection,
    indexName: env.VECTOR_INDEX_NAME,
    textKey: 'text',
    embeddingKey: 'embedding',
  });
  
  await vectorStore.addDocuments(documents);

  return documents.length;
}

export async function deleteCrawlData(threadId: string): Promise<number> {
  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  const result = await collection.deleteMany({ threadId });
  return result.deletedCount;
}
