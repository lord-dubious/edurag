'use client';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputTools,
  PromptInputProvider,
  PromptInputButton,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Phone } from 'lucide-react';
import type { ChatStatus } from 'ai';

interface Props {
  onSubmit: (message: PromptInputMessage) => void;
  status: ChatStatus;
  defaultInput?: string;
  onVoiceMode?: () => void;
}

export function ChatInput({ onSubmit, status, defaultInput, onVoiceMode }: Props) {
  const input = (
    <PromptInput onSubmit={onSubmit} className="w-full max-w-3xl mx-auto bg-background rounded-xl border shadow-sm">
      <PromptInputBody>
        <PromptInputTextarea placeholder="Ask about admissions, programs, tuition…" />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <div className="flex items-center gap-2">
          {onVoiceMode && (
            <PromptInputButton
              onClick={onVoiceMode}
              title="Voice call"
              aria-label="Start voice call"
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shadow-sm border-none shadow-black/5 flex items-center justify-center p-2"
            >
              <Phone className="size-4" />
            </PromptInputButton>
          )}
          <PromptInputSubmit status={status} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shadow-sm border-none shadow-black/5" />
        </div>
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
