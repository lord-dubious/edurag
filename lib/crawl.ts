import { tavily } from '@tavily/core';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { env } from './env';
import { embeddings } from './providers';
import { getMongoCollection } from './vectorstore';
import { DEFAULT_CRAWL_INSTRUCTIONS } from './agent/prompts';

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
    instructions: opts.instructions ?? env.CRAWL_INSTRUCTIONS ?? DEFAULT_CRAWL_INSTRUCTIONS,
    selectPaths: selectPaths?.length ? selectPaths : undefined,
    excludePaths: excludePaths?.length ? excludePaths : undefined,
    allowExternal: opts.allowExternal ?? env.CRAWL_ALLOW_EXTERNAL,
    format: opts.format ?? env.CRAWL_FORMAT,
  });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const seenUrls = new Set<string>();
  const documents: Document[] = [];
  const uniqueResults = crawlResponse.results.filter(r => {
    if (seenUrls.has(r.url)) return false;
    seenUrls.add(r.url);
    return true;
  });
  const total = uniqueResults.length;

  for (let i = 0; i < total; i++) {
    const result = uniqueResults[i];
    opts.onProgress?.(i + 1, total);

    const urlObj = new URL(result.url);
    const title = urlObj.pathname.split('/').filter(Boolean).pop() ?? urlObj.hostname;
    const chunks = await splitter.createDocuments([result.rawContent], [{
      url: result.url,
      title,
      threadId: opts.threadId,
      baseUrl: opts.url,
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
