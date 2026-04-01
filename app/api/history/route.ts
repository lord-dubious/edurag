import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { getUserConversations } from '@/lib/conversation';
import { errorResponse } from '@/lib/errors';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  const { searchParams } = new URL(req.url);
  const rawLimit = searchParams.get('limit');
  const parsedLimit = rawLimit ? Number(rawLimit) : NaN;
  const requestedLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;

  const conversations = await getUserConversations(session.user.id, requestedLimit);
  return NextResponse.json(conversations);
}
