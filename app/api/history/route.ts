import { auth } from '@/auth';
import { getUserConversations } from '@/lib/conversation';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawLimit = searchParams.get('limit');
  const requestedLimit = rawLimit ? Number(rawLimit) : 20;

  const conversations = await getUserConversations(session.user.id, requestedLimit);
  return NextResponse.json(conversations);
}
