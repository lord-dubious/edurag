import { NextRequest } from 'next/server';
import { tavily } from '@tavily/core';
import { env } from '@/lib/env';
import { getMongoCollection } from '@/lib/vectorstore';
import { getEmbeddings } from '@/lib/providers';
import { cleanContent, extractTitle } from '@/lib/crawl';

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

function sendProgress(controller: ReadableStreamDefaultController, data: CrawlProgress) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = start + chunkSize;
    chunks.push(text.slice(start, end));
    start = end - overlap;
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { 
    universityUrl, 
    externalUrls = [] as string[], 
    excludePaths = [] as string[],
    crawlConfig = { maxDepth: 3, limit: 300 } as { maxDepth?: number; limit?: number },
    fileTypeRules = { pdf: 'index', docx: 'index', csv: 'skip' } as FileTypeRules,
  } = body;

  const maxDepth = crawlConfig.maxDepth || 3;
  const limit = crawlConfig.limit || 300;

  if (!universityUrl) {
    return new Response(JSON.stringify({ error: 'University URL is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const tvly = tavily({ apiKey: env.TAVILY_API_KEY });
      const embeddings = getEmbeddings();
      
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
                limit: isExternal ? 50 : limit,
                extractDepth: 'basic',
                query: 'university academic programs courses admissions research faculty',
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

            const collection = await getMongoCollection('crawled_index');
            
            for (const page of crawlResult.results) {
              if (!page.url || !page.rawContent) continue;
              
              if (shouldSkipFile(page.url, fileTypeRules)) {
                continue;
              }

              const cleaned = cleanContent(page.rawContent);
              if (cleaned.length < 100) continue;

              const title = extractTitle(page.rawContent, page.url) || page.url.split('/').pop() || 'Untitled';
              const chunks = chunkText(cleaned, 1500, 300);
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
              for (let j = 0; j < chunks.length; j++) {
                const chunk = chunks[j];
                const embedding = await embeddings.embedDocuments([chunk]);
                
                documents.push({
                  content: chunk,
                  url: page.url,
                  title,
                  sourceType: isExternal ? 'external' : 'university',
                  chunkIndex: j,
                  totalChunks: chunks.length,
                  embedding: embedding[0],
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
