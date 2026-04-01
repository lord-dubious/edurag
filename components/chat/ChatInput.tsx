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
  voiceHelperText?: string;
  voiceDisabled?: boolean;
}

export function ChatInput({ onSubmit, status, defaultInput, onVoiceMode, voiceHelperText, voiceDisabled }: Props) {
  const input = (
    <PromptInput
      onSubmit={onSubmit}
      className='surface-glass mx-auto w-full max-w-4xl rounded-2xl shadow-[0_18px_34px_-24px_rgba(0,0,0,0.65)]'
    >
      <PromptInputBody>
        <PromptInputTextarea
          placeholder='Ask about admissions, programs, tuition, deadlines...'
          className='min-h-[56px] bg-transparent text-base placeholder:text-muted-foreground/85'
        />
      </PromptInputBody>
      <PromptInputFooter className='rounded-b-2xl border-t border-white/35 bg-transparent p-2.5 dark:border-white/10'>
        <div className='hidden sm:block'>
          <PromptInputTools />
        </div>
        {voiceHelperText && (
          <span className='text-xs text-muted-foreground'>{voiceHelperText}</span>
        )}
        <div className='flex items-center gap-2'>
          {onVoiceMode && (
            <PromptInputButton
              onClick={onVoiceMode}
              title='Voice call'
              aria-label='Start voice call'
              disabled={voiceDisabled}
              className='brand-glow-dot flex items-center justify-center rounded-lg bg-primary p-2 text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60'
            >
              <Phone className='size-4' />
            </PromptInputButton>
          )}
          <PromptInputSubmit
            status={status}
            className='rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:bg-primary/90'
          />
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
