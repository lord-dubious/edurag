'use client';

import { useState, useCallback } from 'react';
import { nanoid } from 'nanoid';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { SessionSidebar } from './SessionSidebar';
import { CitationPanel } from './CitationPanel';

interface Source {
  url: string;
  title?: string;
  content: string;
}

interface VectorSearchResult {
  url: string;
  title?: string;
  content: string;
  score: number;
}

interface VectorSearchToolPart {
  type: 'tool-vector_search';
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  input: { query: string; topK?: number };
  output?: { found: boolean; results: VectorSearchResult[] };
}

interface VectorSearchToolPartWithOutput {
  type: 'tool-vector_search';
  toolCallId: string;
  state: 'output-available';
  input: { query: string; topK?: number };
  output: { found: boolean; results: VectorSearchResult[] };
}

type MessagePart = { type: string; state?: string; output?: unknown };

function isVectorSearchToolPart(part: MessagePart): part is VectorSearchToolPartWithOutput {
  return part.type === 'tool-vector_search' && part.state === 'output-available' && 'output' in part;
}

export function ChatInterface() {
  const [threadId, setThreadId] = useState(() => nanoid());
  const [sources, setSources] = useState<Record<string, Source[]>>({});
  const [showSources, setShowSources] = useState(true);

  const { messages, status, error, sendMessage, regenerate, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { threadId },
    }),
    onFinish: ({ message }) => {
      if (message.parts) {
        const toolParts = message.parts.filter(isVectorSearchToolPart);
        if (toolParts.length > 0) {
          const newSources: Source[] = [];
          toolParts.forEach((part) => {
            if (part.output?.results) {
              part.output.results.forEach((r: VectorSearchResult) => {
                newSources.push({
                  url: r.url,
                  title: r.title,
                  content: r.content,
                });
              });
            }
          });
          if (newSources.length > 0) {
            setSources(prev => ({
              ...prev,
              [message.id]: newSources,
            }));
          }
        }
      }
    },
  });

  const handleSubmit = useCallback(
    (message: { text: string }) => {
      sendMessage({ text: message.text });
    },
    [sendMessage]
  );

  const handleNewChat = useCallback(() => {
    setThreadId(nanoid());
    setMessages([]);
    setSources({});
  }, [setMessages]);

  const handleSelectSession = useCallback((id: string) => {
    setThreadId(id);
    setMessages([]);
    setSources({});
  }, [setMessages]);

  const lastMessage = messages.at(-1);
  const lastSources = lastMessage ? sources[lastMessage.id] ?? [] : [];

  return (
    <div className="flex h-screen">
      <SessionSidebar
        currentThreadId={threadId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
      />

      <div className="flex-1 flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <h1 className="text-lg font-semibold">{process.env.NEXT_PUBLIC_APP_NAME}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSources(!showSources)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {showSources ? 'Hide' : 'Show'} Sources
            </button>
            <button
              onClick={handleNewChat}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:opacity-90"
            >
              New Chat
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto p-4">
              <ChatMessages
                messages={messages}
                sources={sources}
                status={status}
                onRegenerate={regenerate}
              />
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mt-4">
                  <span>Something went wrong.</span>
                  <button
                    onClick={() => regenerate()}
                    className="underline font-medium"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 border-t">
              <ChatInput onSubmit={handleSubmit} status={status} />
            </div>
          </main>

          {showSources && lastSources.length > 0 && (
            <CitationPanel sources={lastSources} />
          )}
        </div>
      </div>
    </div>
  );
}
