import { auth } from "@/auth";
import { getConversation } from "@/lib/conversation";
import { NextResponse } from "next/server";

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
