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
  onStop?: () => void;
  defaultInput?: string;
  onVoiceMode?: () => void;
  voiceHelperText?: string;
  voiceDisabled?: boolean;
}

export function ChatInput({ onSubmit, status, onStop, defaultInput, onVoiceMode, voiceHelperText, voiceDisabled }: Props) {
  const input = (
    <PromptInput onSubmit={onSubmit} className="w-full max-w-3xl mx-auto bg-background rounded-xl border shadow-sm">
      <PromptInputBody>
        <PromptInputTextarea placeholder="Ask about admissions, programs, tuition…" />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        {voiceHelperText && (
          <span className="text-xs text-muted-foreground">{voiceHelperText}</span>
        )}
        <div className="flex items-center gap-2">
          {onVoiceMode && (
            <PromptInputButton
              onClick={onVoiceMode}
              title="Voice chat"
              aria-label="Start voice chat"
              disabled={voiceDisabled}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shadow-sm border-none shadow-black/5 flex items-center justify-center p-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Phone className="size-4" />
            </PromptInputButton>
          )}
          <PromptInputSubmit status={status} onStop={onStop} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-md shadow-sm border-none shadow-black/5" />
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
