'use client';

import { type UIMessage, type ChatStatus } from 'ai';
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';
import { CopyIcon, RefreshCcwIcon } from 'lucide-react';
import { Fragment } from 'react';

interface Source {
  url: string;
  title?: string;
  content: string;
}

interface Props {
  messages: UIMessage[];
  sources: Record<string, Source[]>;
  status: ChatStatus;
  onRegenerate: () => void;
}

export function ChatMessages({ messages, sources, status, onRegenerate }: Props) {
  if (messages.length === 0) {
    return (
      <ConversationEmptyState
        title="Ask anything about the university"
        description="I can help with admissions, programs, tuition, campus life, and more."
      />
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message, idx) => {
        const isLast = idx === messages.length - 1;
        const msgSources = sources[message.id] ?? [];

        return (
          <Fragment key={message.id}>
            <Message from={message.role}>
              <MessageContent>
                {message.parts.map((part, i) =>
                  part.type === 'text' ? (
                    <MessageResponse key={`${message.id}-${i}`}>
                      {(part as any).text}
                    </MessageResponse>
                  ) : null
                )}
              </MessageContent>
            </Message>

            {message.role === 'assistant' && isLast && status === 'ready' && (
              <MessageActions>
                <MessageAction
                  label="Copy"
                  onClick={() => {
                    const text = message.parts
                      .filter(p => p.type === 'text')
                      .map(p => (p as any).text)
                      .join('');
                    navigator.clipboard.writeText(text);
                  }}
                >
                  <CopyIcon className="size-3" />
                </MessageAction>
                <MessageAction label="Regenerate" onClick={onRegenerate}>
                  <RefreshCcwIcon className="size-3" />
                </MessageAction>
              </MessageActions>
            )}

            {msgSources.length > 0 && message.role === 'assistant' && (
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                {msgSources.map((source, i) => (
                  <InlineCitation key={i}>
                    <InlineCitationCard>
                      <InlineCitationCardTrigger sources={[source.url]} />
                      <InlineCitationCardBody>
                        <InlineCitationCarousel>
                          <InlineCitationCarouselContent>
                            <InlineCitationCarouselItem>
                              <InlineCitationSource
                                title={source.title ?? source.url}
                                url={source.url}
                                description={source.content.slice(0, 120) + '…'}
                              />
                            </InlineCitationCarouselItem>
                          </InlineCitationCarouselContent>
                        </InlineCitationCarousel>
                      </InlineCitationCardBody>
                    </InlineCitationCard>
                  </InlineCitation>
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
