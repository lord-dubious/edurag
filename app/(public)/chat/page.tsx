import { ChatInterface } from '@/components/chat/ChatInterface';
import { Suspense } from 'react';

async function ChatPageContent({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const initialQuery = params.q ? decodeURIComponent(params.q) : undefined;
  return <ChatInterface initialQuery={initialQuery} />;
}

export default function ChatPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return (
    <Suspense fallback={<ChatInterface />}>
      <ChatPageContent searchParams={searchParams} />
    </Suspense>
  );
}
