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
import { Mic, Paperclip, Send } from 'lucide-react';
import type { ChatStatus } from 'ai';

interface Props {
  onSubmit: (message: PromptInputMessage) => void;
  status: ChatStatus;
  defaultInput?: string;
  onVoiceMode?: () => void;
}

export function ChatInput({ onSubmit, status, defaultInput, onVoiceMode }: Props) {
  const input = (
    <div className="w-full max-w-3xl mx-auto relative group">
      <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-secondary/30 rounded-[32px] blur opacity-30 group-hover:opacity-60 transition duration-500"></div>
      <PromptInput onSubmit={onSubmit} className="relative bg-background/80 backdrop-blur-xl border border-white/10 rounded-[32px] px-2 py-2 shadow-2xl shadow-black/20 transition-all duration-300 focus-within:ring-1 focus-within:ring-primary/30">
        <PromptInputBody className="px-2">
          <PromptInputTextarea
             placeholder="Ask anything..."
             className="min-h-[52px] py-3.5 text-base placeholder:text-muted-foreground/40 bg-transparent border-none focus-visible:ring-0 shadow-none resize-none"
          />
        </PromptInputBody>
        <PromptInputFooter className="px-2 pb-1.5 flex justify-between items-center">
          <PromptInputTools className="flex gap-1">
            <PromptInputButton className="text-muted-foreground hover:text-foreground hover:bg-white/5 rounded-full w-9 h-9 transition-colors" tooltip="Attach file">
               <Paperclip className="size-5" />
            </PromptInputButton>
          </PromptInputTools>
          <div className="flex items-center gap-2">
            {onVoiceMode && (
              <PromptInputButton
                onClick={onVoiceMode}
                title="Voice Mode"
                className="text-primary hover:text-primary hover:bg-primary/10 rounded-full w-9 h-9 transition-colors"
                tooltip="Start voice chat"
              >
                <Mic className="size-5" />
              </PromptInputButton>
            )}
            <PromptInputSubmit
               status={status}
               className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full w-10 h-10 shadow-[0_0_20px_-5px_var(--color-primary)] hover:shadow-[0_0_25px_-5px_var(--color-primary)] transition-all duration-300 flex items-center justify-center p-0 border border-white/20 active:scale-95"
            >
               <Send className="size-4 ml-0.5" />
            </PromptInputSubmit>
          </div>
        </PromptInputFooter>
      </PromptInput>
    </div>
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
