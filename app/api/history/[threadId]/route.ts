import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteConversation, getConversation, appendMessage } from "@/lib/conversation";
import { z } from 'zod';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { threadId } = await params;
  const conversation = await getConversation(threadId, session.user.id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(conversation);
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const { threadId } = await params;
  await appendMessage(threadId, {
    role: parsed.data.role,
    content: parsed.data.content,
    timestamp: new Date(),
  }, session.user.id);

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { threadId } = await params;
  const deleted = await deleteConversation(threadId, session.user.id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found or not authorized" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
