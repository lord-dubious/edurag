import { z } from 'zod';
import { crawlAndVectorize } from '@/lib/crawl';
import { verifyAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';
import { NextRequest } from 'next/server';

const bodySchema = z.object({
  url: z.string().url(),
  threadId: z.string().min(1),
  maxDepth: z.coerce.number().min(1).max(5).optional(),
  maxBreadth: z.coerce.number().min(1).max(100).optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
  extractDepth: z.enum(['basic', 'advanced']).optional(),
  instructions: z.string().optional(),
  selectPaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
});

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid input', 400, err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        send({ type: 'status', message: `Starting crawl of ${body.url}` });
        const count = await crawlAndVectorize({
          ...body,
          onProgress: (page, total) => send({ type: 'progress', page, total }),
        });
        send({ type: 'complete', documentsIndexed: count });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Crawl failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
