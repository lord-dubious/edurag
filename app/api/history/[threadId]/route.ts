import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { deleteConversation, getConversation, saveMessage } from '@/lib/conversation';
import { z } from 'zod';

import { errorResponse } from '@/lib/errors';

const sourceSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  content: z.string(),
  score: z.number().optional(),
  sourceType: z.enum(['vector', 'web']).optional(),
});

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  id: z.string().optional(),
  sources: z.array(sourceSchema).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }
  const { threadId } = await params;
  const conversation = await getConversation(threadId, session.user.id);
  if (!conversation) {
    return errorResponse('NOT_FOUND', 'Not Found', 404);
  }
  return NextResponse.json(conversation);
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse('VALIDATION_ERROR', 'Invalid message', 400);
  }

  const { threadId } = await params;
  try {
    await saveMessage(threadId, {
      id: parsed.data.id,
      role: parsed.data.role,
      content: parsed.data.content,
      timestamp: new Date(),
      sources: parsed.data.sources,
    }, session.user.id);
  } catch (err) {
    console.error('[History POST] Error appending message:', err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('authorized') || msg.toLowerCase().includes('forbidden')) {
      return errorResponse('FORBIDDEN', 'Forbidden', 403);
    }
    if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('missing')) {
      return errorResponse('NOT_FOUND', 'Not Found', 404);
    }
    return errorResponse('INTERNAL_ERROR', 'Internal Server Error', 500);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }
  const { threadId } = await params;
  const deleted = await deleteConversation(threadId, session.user.id);
  if (!deleted) {
    return errorResponse('NOT_FOUND', 'Not found or not authorized', 404);
  }
  return NextResponse.json({ success: true });
}
