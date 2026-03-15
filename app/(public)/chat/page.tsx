import { ChatInterface } from '@/components/chat/ChatInterface';
import { Suspense } from 'react';

type ChatSearchParams = {
  q?: string;
  voice?: string | string[];
};

async function ChatPageContent({ searchParams }: { searchParams: Promise<ChatSearchParams> }) {
  const params = await searchParams;
  let initialQuery: string | undefined;
  if (params.q) {
    try {
      initialQuery = decodeURIComponent(params.q);
    } catch {
      initialQuery = params.q;
    }
  }
  const voiceValue = Array.isArray(params.voice) ? params.voice[0] : params.voice;
  const initialVoice = voiceValue === '1' || voiceValue === 'true';
  return <ChatInterface initialQuery={initialQuery} initialVoice={initialVoice} />;
}

export default function ChatPage({ searchParams }: { searchParams: Promise<ChatSearchParams> }) {
  return (
    <Suspense fallback={<ChatInterface />}>
      <ChatPageContent searchParams={searchParams} />
    </Suspense>
  );
}
