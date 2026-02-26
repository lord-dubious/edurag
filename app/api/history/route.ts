import { auth } from "@/auth";
import { getUserConversations } from "@/lib/conversation";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const conversations = await getUserConversations(session.user.id);
  return NextResponse.json(conversations);
}
