'use client';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputTools,
  PromptInputProvider,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';

interface Props {
  onSubmit: (message: PromptInputMessage) => void;
  status: ChatStatus;
  defaultInput?: string;
}

export function ChatInput({ onSubmit, status, defaultInput }: Props) {
  const input = (
    <PromptInput onSubmit={onSubmit} className="w-full max-w-3xl mx-auto">
      <PromptInputBody>
        <PromptInputTextarea placeholder="Ask about admissions, programs, tuition…" />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <PromptInputSubmit status={status} />
      </PromptInputFooter>
    </PromptInput>
  );

  if (defaultInput) {
    return (
      <PromptInputProvider initialInput={defaultInput}>
        {input}
      </PromptInputProvider>
    );
  }

  return input;
}
