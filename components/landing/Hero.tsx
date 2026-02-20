'use client';

import { useRouter } from 'next/navigation';
import { PromptInput, PromptInputBody, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';

interface HeroProps {
  appName?: string;
}

export function Hero({ appName }: HeroProps) {
  const router = useRouter();
  const name = appName ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'University Knowledge Base';

  const handleSubmit = (message: PromptInputMessage) => {
    const encodedQuery = encodeURIComponent(message.text);
    router.push(`/chat?q=${encodedQuery}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] py-12 px-4">
      <div className="text-center mb-8 max-w-2xl">
        <p className="text-sm font-medium text-muted-foreground mb-4 tracking-wide">
          {name}
        </p>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4 leading-tight">
          Ask questions about{' '}
          <em className="text-primary not-italic font-semibold">{name}</em>
        </h1>
        <p className="text-base text-muted-foreground">
          Get instant answers about admissions, programs, tuition, campus life, and more.
        </p>
      </div>

      <div className="w-full max-w-xl">
        <PromptInput onSubmit={handleSubmit} className="shadow-md">
          <PromptInputBody>
            <PromptInputTextarea 
              placeholder="Ask anything about the university..."
              className="min-h-[48px] text-base"
            />
          </PromptInputBody>
          <PromptInputFooter>
            <div className="flex-1" />
            <PromptInputSubmit status={'ready' as ChatStatus} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
