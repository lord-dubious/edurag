import type { NextRequest } from 'next/server';
import { tavily } from '@tavily/core';
import { env } from '@/lib/env';
import { getMongoCollection } from '@/lib/vectorstore';
import { getEmbeddings } from '@/lib/providers';
import { cleanContent, extractTitle } from '@/lib/crawl';
import { errorResponse } from '@/lib/errors';
import { DEFAULT_CRAWL_INSTRUCTIONS } from '@/lib/constants';

interface CrawlProgress {
  phase: 'preparing' | 'crawling' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error';
  message: string;
  pagesFound: number;
  pagesProcessed: number;
  chunksCreated: number;
  docsStored: number;
  currentUrl?: string;
  error?: string;
}

interface FileTypeRules {
  pdf: 'index' | 'skip';
  docx: 'index' | 'skip';
  csv: 'index' | 'skip';
}

function sendProgress(controller: ReadableStreamDefaultController, data: CrawlProgress): void {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const effectiveOverlap = overlap >= chunkSize ? Math.floor(chunkSize / 4) : overlap;
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - effectiveOverlap;
  }
  return chunks;
}

function shouldSkipFile(url: string, fileTypeRules: FileTypeRules): boolean {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith('.pdf') && fileTypeRules.pdf === 'skip') return true;
  if ((lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.doc')) && fileTypeRules.docx === 'skip') return true;
  if (lowerUrl.endsWith('.csv') && fileTypeRules.csv === 'skip') return true;
  return false;
}

function isBinaryFile(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith('.pdf') || 
         lowerUrl.endsWith('.docx') || 
         lowerUrl.endsWith('.doc') || 
         lowerUrl.endsWith('.xlsx') || 
         lowerUrl.endsWith('.xls') || 
         lowerUrl.endsWith('.pptx') || 
         lowerUrl.endsWith('.ppt') ||
         lowerUrl.endsWith('.zip') ||
         lowerUrl.endsWith('.exe') ||
         lowerUrl.endsWith('.dmg');
}

interface CrawlRequestBody {
  universityUrl: string;
  externalUrls?: string[];
  excludePaths?: string[];
  crawlConfig?: { maxDepth?: number; maxBreadth?: number; limit?: number };
  fileTypeRules?: FileTypeRules;
  crawlerInstructions?: string;
  apiKeys?: {
    embeddingApiKey?: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
    tavilyApiKey?: string;
    mongodbUri?: string;
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch (error) {
    console.error('[Crawl] Failed to parse JSON:', error);
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON in request body', 400);
  }
  
  if (typeof rawBody !== 'object' || rawBody === null) {
    return errorResponse('VALIDATION_ERROR', 'Request body must be an object', 400);
  }
  
  const body = rawBody as Record<string, unknown>;
  
  if (!body.universityUrl || typeof body.universityUrl !== 'string') {
    return errorResponse('VALIDATION_ERROR', 'universityUrl is required', 400);
  }
  
  const { 
    universityUrl, 
    externalUrls = [], 
    excludePaths = [],
    crawlConfig = { maxDepth: 3, limit: 300 },
    fileTypeRules = { pdf: 'index', docx: 'index', csv: 'skip' },
    crawlerInstructions = '',
    apiKeys = {},
  } = body as unknown as CrawlRequestBody;

  const embeddingApiKey = apiKeys.embeddingApiKey || env.EMBEDDING_API_KEY;
  const embeddingModel = apiKeys.embeddingModel || env.EMBEDDING_MODEL;
  const embeddingDimensions = apiKeys.embeddingDimensions || env.EMBEDDING_DIMENSIONS;
  const tavilyApiKey = apiKeys.tavilyApiKey || env.TAVILY_API_KEY;
  const mongodbUri = apiKeys.mongodbUri || env.MONGODB_URI;

  if (!embeddingApiKey) {
    return errorResponse('VALIDATION_ERROR', 'Embedding API key is required', 400);
  }
  if (!tavilyApiKey) {
    return errorResponse('VALIDATION_ERROR', 'Tavily API key is required', 400);
  }
  if (!mongodbUri) {
    return errorResponse('VALIDATION_ERROR', 'MongoDB URI is required', 400);
  }

  const maxDepth = crawlConfig.maxDepth ?? 3;
  const maxBreadth = crawlConfig.maxBreadth ?? 50;
  const limit = crawlConfig.limit ?? 300;

  if (!universityUrl) {
    return errorResponse('VALIDATION_ERROR', 'University URL is required', 400);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const tvly = tavily({ apiKey: tavilyApiKey });
      
      let totalChunks = 0;
      let totalDocs = 0;
      let totalPages = 0;
      const allUrls = [universityUrl, ...externalUrls];

      try {
        sendProgress(controller, { 
          phase: 'preparing', 
          message: 'Starting crawl...',
          pagesFound: allUrls.length,
          pagesProcessed: 0,
          chunksCreated: 0,
          docsStored: 0,
        });

        for (let i = 0; i < allUrls.length; i++) {
          const baseUrl = allUrls[i];
          const isExternal = i > 0;
          
          sendProgress(controller, {
            phase: 'crawling',
            message: `Crawling ${isExternal ? 'external source' : 'university site'}...`,
            pagesFound: allUrls.length,
            pagesProcessed: i,
            chunksCreated: totalChunks,
            docsStored: totalDocs,
            currentUrl: baseUrl,
          });

          try {
            const excludePatterns = excludePaths.map((p: string) => 
              p.startsWith('/') ? `${baseUrl}${p}` : p
            );

            const crawlResult = await tvly.crawl(
              baseUrl,
              {
                maxDepth: isExternal ? 1 : maxDepth,
                maxBreadth: isExternal ? 20 : maxBreadth,
                limit: isExternal ? 50 : limit,
                extractDepth: 'basic',
                instructions: crawlerInstructions || DEFAULT_CRAWL_INSTRUCTIONS,
                excludePaths: excludePatterns.length > 0 ? excludePatterns : undefined,
              }
            );

            if (!crawlResult.results || crawlResult.results.length === 0) {
              sendProgress(controller, {
                phase: 'crawling',
                message: 'No pages found',
                pagesFound: allUrls.length,
                pagesProcessed: i,
                chunksCreated: totalChunks,
                docsStored: totalDocs,
                currentUrl: baseUrl,
              });
              continue;
            }

            const collection = await getMongoCollection('crawled_index', mongodbUri);
            
            for (const page of crawlResult.results) {
              if (!page.url || !page.rawContent) continue;
              
              if (isBinaryFile(page.url)) {
                console.log(`Skipping binary file: ${page.url}`);
                continue;
              }
              
              if (shouldSkipFile(page.url, fileTypeRules)) {
                continue;
              }

              const cleaned = cleanContent(page.rawContent);
              if (cleaned.length < 100) continue;

              const title = extractTitle(page.rawContent, page.url) || page.url.split('/').pop() || 'Untitled';
              const rawChunks = chunkText(cleaned, 1500, 300);
              const chunks = rawChunks.filter(c => c.trim().length > 50);
              
              if (chunks.length === 0) {
                console.log(`No valid chunks for ${page.url}`);
                continue;
              }
              
              totalChunks += chunks.length;

              sendProgress(controller, {
                phase: 'embedding',
                message: `Embedding ${chunks.length} chunks...`,
                pagesFound: allUrls.length,
                pagesProcessed: i,
                chunksCreated: totalChunks,
                docsStored: totalDocs,
                currentUrl: page.url,
              });

              const documents = [];
              let embeddingsArray: number[][] | undefined;
              try {
                console.log(`Embedding ${chunks.length} chunks for ${page.url}, first chunk length: ${chunks[0]?.length ?? 0}`);
                const embeddingsInstance = getEmbeddings(embeddingApiKey, embeddingModel, embeddingDimensions);
                embeddingsArray = await embeddingsInstance.embedDocuments(chunks);
                console.log(`Got ${embeddingsArray?.length ?? 0} embeddings`);
              } catch (embedError) {
                console.error(`Embedding failed for ${page.url}:`, embedError instanceof Error ? embedError.message : embedError);
                console.error(`Chunks info: count=${chunks.length}, lengths=[${chunks.slice(0, 3).map(c => c.length).join(', ')}...]`);
                continue;
              }
              
              if (!embeddingsArray || embeddingsArray.length !== chunks.length) {
                console.error(`Embedding mismatch for ${page.url}: got ${embeddingsArray?.length ?? 0} embeddings for ${chunks.length} chunks`);
                continue;
              }
              
              for (let j = 0; j < chunks.length; j++) {
                documents.push({
                  content: chunks[j],
                  url: page.url,
                  title,
                  sourceType: isExternal ? 'external' : 'university',
                  chunkIndex: j,
                  totalChunks: chunks.length,
                  embedding: embeddingsArray[j],
                  crawledAt: new Date(),
                  updatedAt: new Date(),
                });
              }

              if (documents.length > 0) {
                await collection.insertMany(documents);
                totalDocs += documents.length;
                totalPages++;

                sendProgress(controller, {
                  phase: 'storing',
                  message: `Stored ${documents.length} chunks from ${title}`,
                  pagesFound: allUrls.length,
                  pagesProcessed: i,
                  chunksCreated: totalChunks,
                  docsStored: totalDocs,
                  currentUrl: page.url,
                });
              }
            }
          } catch (crawlError) {
            console.error(`Error crawling ${baseUrl}:`, crawlError);
            sendProgress(controller, {
              phase: 'error',
              message: 'Crawl failed for this source',
              pagesFound: allUrls.length,
              pagesProcessed: i,
              chunksCreated: totalChunks,
              docsStored: totalDocs,
              currentUrl: baseUrl,
              error: crawlError instanceof Error ? crawlError.message : 'Crawl failed',
            });
          }
        }

        sendProgress(controller, {
          phase: 'complete',
          message: `Crawl complete! Indexed ${totalDocs} chunks from ${totalPages} pages.`,
          pagesFound: totalPages,
          pagesProcessed: totalPages,
          chunksCreated: totalChunks,
          docsStored: totalDocs,
        });

        controller.close();
      } catch (error) {
        sendProgress(controller, {
          phase: 'error',
          message: 'Crawl failed',
          pagesFound: 0,
          pagesProcessed: 0,
          chunksCreated: 0,
          docsStored: 0,
          error: error instanceof Error ? error.message : 'Crawl failed',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
