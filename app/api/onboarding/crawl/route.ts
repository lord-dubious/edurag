import { errorResponse } from '@/lib/errors';
import type { NextRequest } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { runOnboardingCrawl } from '@/lib/onboarding-crawl';
import type { OnboardingCrawlProgress } from '@/lib/onboarding-crawl';

function sendProgress(controller: ReadableStreamDefaultController, data: OnboardingCrawlProgress): void {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!(await verifyAdmin())) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

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

  const stream = new ReadableStream({
    async start(controller) {
      try {
        await runOnboardingCrawl({
          universityUrl: body.universityUrl as string,
          externalUrls: body.externalUrls as string[] | undefined,
          excludePaths: body.excludePaths as string[] | undefined,
          crawlConfig: (body.crawlConfig as Record<string, unknown>) || undefined,
          fileTypeRules: (body.fileTypeRules as import('@/lib/onboarding-crawl').FileTypeRules) || undefined,
          crawlerInstructions: body.crawlerInstructions as string | undefined,
          onProgress: (update) => sendProgress(controller, update),
          signal: request.signal,
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
