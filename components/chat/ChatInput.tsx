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
    <PromptInput onSubmit={onSubmit} className="w-full max-w-3xl mx-auto">
      <PromptInputBody>
        <PromptInputTextarea placeholder="Ask about admissions, programs, tuition…" />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <div className="flex items-center gap-1">
          {onVoiceMode && (
            <PromptInputButton onClick={onVoiceMode} title="Voice call">
              <Phone className="size-4" />
            </PromptInputButton>
          )}
          <PromptInputSubmit status={status} />
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
