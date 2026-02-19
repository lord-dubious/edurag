import { ChatInterface } from '@/components/chat/ChatInterface';
import { Suspense } from 'react';

function ChatPageContent({ searchParams }: { searchParams: { q?: string } }) {
  const initialQuery = searchParams.q ? decodeURIComponent(searchParams.q) : undefined;
  return <ChatInterface initialQuery={initialQuery} />;
}

export default function ChatPage({ searchParams }: { searchParams: { q?: string } }) {
  return (
    <Suspense fallback={<ChatInterface />}>
      <ChatPageContent searchParams={searchParams} />
    </Suspense>
  );
}
