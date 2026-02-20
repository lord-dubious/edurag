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

function cleanContent(raw: string | null | undefined): string {
  if (!raw || typeof raw !== 'string') return '';
  try {
    return raw
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/\b(?:Skip to content|Main menu|Navigation|Search|Login|Sign in|Sign out|Menu|Close|Back to top|Print|Share|Font Size|A A A|High Contrast)\b/gi, '')
      .replace(/We use cookies[^.]*\./gi, '')
      .replace(/By using our website[^.]*\./gi, '')
      .replace(/This site uses cookies[^.]*\./gi, '')
      .replace(/Cookie Policy/gi, '')
      .replace(/Accept All Cookies?/gi, '')
      .replace(/Cookie Settings/gi, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
}

function extractTitle(rawContent: string | null | undefined, url: string): string {
  if (!rawContent) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }
  const titleMatch = rawContent.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch?.[1]) {
    const title = titleMatch[1].trim();
    // Remove common suffixes like " | Site Name" or " - Site Name"
    return title.split(/[|\-–—]/)[0].trim().slice(0, 100);
  }

  // Try first <h1>
  const h1Match = rawContent.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match?.[1]) {
    return h1Match[1].trim().slice(0, 100);
  }

  // Fallback to URL pathname
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      return lastPart.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    return urlObj.hostname;
  } catch {
    return url;
  }
}

function isQualityChunk(content: string): boolean {
  if (content.length < 50) return false;
  const navPatterns = /^(Home|About|Contact|Menu|Search|Login|Services|Products)$/i;
  if (navPatterns.test(content.trim())) return false;
  const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length < 5) return false;
  return true;
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
    chunkSize: 1500,
    chunkOverlap: 300,
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

    if (!result.rawContent) continue;

    const cleanedContent = cleanContent(result.rawContent);
    if (cleanedContent.length < 200) continue;

    const title = extractTitle(result.rawContent, result.url);

    const chunks = await splitter.createDocuments([cleanedContent], [{
      url: result.url,
      title,
      threadId: opts.threadId,
      baseUrl: opts.url,
    }]);

    const qualityChunks = chunks.filter(c => isQualityChunk(c.pageContent));
    documents.push(...qualityChunks);
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
