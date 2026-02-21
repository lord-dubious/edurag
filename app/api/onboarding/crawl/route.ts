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
  currentUrl?: string;
  error?: string;
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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { 
    universityUrl, 
    externalUrls = [] as string[], 
    excludePaths = [] as string[],
    maxDepth = 3,
    limit = 300,
  } = body;

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
      
      let totalIndexed = 0;
      let totalPages = 0;
      const allUrls = [universityUrl, ...externalUrls];

      try {
        sendProgress(controller, { 
          phase: 'preparing', 
          message: 'Starting crawl...',
          pagesFound: allUrls.length,
          pagesProcessed: 0,
        });

        for (let i = 0; i < allUrls.length; i++) {
          const baseUrl = allUrls[i];
          const isExternal = i > 0;
          
          sendProgress(controller, {
            phase: 'crawling',
            message: `Crawling ${isExternal ? 'external source' : 'university site'}...`,
            pagesFound: allUrls.length,
            pagesProcessed: i,
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
                currentUrl: baseUrl,
              });
              continue;
            }

            const collection = await getMongoCollection('crawled_index');
            
            for (const page of crawlResult.results) {
              if (!page.url || !page.rawContent) continue;

              const cleaned = cleanContent(page.rawContent);
              if (cleaned.length < 100) continue;

              const title = extractTitle(page.rawContent, page.url) || page.url.split('/').pop() || 'Untitled';
              const chunks = chunkText(cleaned, 1500, 300);

              sendProgress(controller, {
                phase: 'embedding',
                message: `Embedding ${chunks.length} chunks...`,
                pagesFound: allUrls.length,
                pagesProcessed: i,
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
                totalIndexed += documents.length;
                totalPages++;

                sendProgress(controller, {
                  phase: 'storing',
                  message: `Stored ${documents.length} chunks`,
                  pagesFound: allUrls.length,
                  pagesProcessed: i,
                  currentUrl: page.url,
                });
              }
            }
          } catch (crawlError) {
            console.error(`Error crawling ${baseUrl}:`, crawlError);
            sendProgress(controller, {
              phase: 'error',
              message: 'Crawl failed',
              pagesFound: allUrls.length,
              pagesProcessed: i,
              currentUrl: baseUrl,
              error: crawlError instanceof Error ? crawlError.message : 'Crawl failed',
            });
          }
        }

        sendProgress(controller, {
          phase: 'complete',
          message: `Crawl complete! Indexed ${totalIndexed} chunks from ${totalPages} pages.`,
          pagesFound: totalPages,
          pagesProcessed: totalPages,
        });

        controller.close();
      } catch (error) {
        sendProgress(controller, {
          phase: 'error',
          message: 'Crawl failed',
          pagesFound: 0,
          pagesProcessed: 0,
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
