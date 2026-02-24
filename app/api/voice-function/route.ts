import { NextRequest, NextResponse } from 'next/server';
import { similaritySearchWithScore } from '@/lib/vectorstore';
import { z } from 'zod';

const VectorSearchArgsSchema = z.object({
  query: z.string().min(1),
  topK: z.number().min(1).max(20).optional().default(5),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, arguments: args } = body;

    if (name === 'vector_search') {
      const { query, topK } = VectorSearchArgsSchema.parse(args);
      
      const results = await similaritySearchWithScore(query, topK);
      
      return NextResponse.json({
        results: results.map(([doc, score]) => ({
          content: doc.pageContent.slice(0, 1000),
          url: doc.metadata.url,
          title: doc.metadata.title,
          score,
        })),
      });
    }

    return NextResponse.json({ error: 'Unknown function' }, { status: 400 });
  } catch (error) {
    console.error('Voice function error:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid arguments', details: error.issues },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
