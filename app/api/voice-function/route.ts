import { NextRequest, NextResponse } from 'next/server';
import { similaritySearchWithScore } from '@/lib/vectorstore';
import { errorResponse } from '@/lib/errors';
import { z } from 'zod';

const VectorSearchArgsSchema = z.object({
  query: z.string().min(1),
  topK: z.number().min(1).max(20).optional().default(5),
});

export async function POST(request: NextRequest) {
  let body: { name?: string; arguments?: unknown };
  try {
    body = await request.json() as { name?: string; arguments?: unknown };
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const { name, arguments: args } = body;

  if (name !== 'vector_search') {
    return errorResponse('VALIDATION_ERROR', 'Unknown function', 400);
  }

  const parsed = VectorSearchArgsSchema.safeParse(args);
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', 'Invalid arguments', 400, parsed.error);
  }

  try {
    const { query, topK } = parsed.data;
    const results = await similaritySearchWithScore(query, topK);

    return NextResponse.json({
      results: results.map(([doc, score]) => ({
        content: doc.pageContent.slice(0, 1000),
        url: doc.metadata.url,
        title: doc.metadata.title,
        score,
      })),
    });
  } catch (err) {
    console.error('Voice function error:', err);
    return errorResponse('INTERNAL_ERROR', 'Internal server error', 500, err);
  }
}
