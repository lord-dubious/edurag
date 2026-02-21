'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { PanelLeftIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
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

export interface StoredSession {
  id: string;
  title: string;
  createdAt: number;
  messages: UIMessage[];
  sources: Record<string, Source[]>;
  initialQuery?: string;
}

const STORAGE_KEY = 'edurag_sessions';

export function loadSessions(): StoredSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: StoredSession[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function findSessionByQuery(query: string): StoredSession | undefined {
  const sessions = loadSessions();
  return sessions.find(s => s.initialQuery === query);
}

interface ChatInterfaceProps {
  initialQuery?: string;
}

export function ChatInterface({ initialQuery }: ChatInterfaceProps) {
  const [threadId, setThreadId] = useState(() => {
    if (initialQuery) {
      const existingSession = findSessionByQuery(initialQuery);
      if (existingSession) return existingSession.id;
      return nanoid();
    }
    const sessions = loadSessions();
    return sessions.length > 0 ? sessions[0].id : nanoid();
  });
const [sources, setSources] = useState<Record<string, Source[]>>(() => {
    const sessions = loadSessions();
    const session = sessions.find(s => s.id === threadId);
    return session?.sources ?? {};
  });
  const [showSources, setShowSources] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const { theme, setTheme } = useTheme();

  const { messages, status, error, sendMessage, regenerate, setMessages } = useChat({
    id: threadId,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { threadId },
    }),
    messages: (() => {
      if (initialQuery) return [];
      const sessions = loadSessions();
      const session = sessions.find(s => s.id === threadId);
      return session?.messages ?? [];
    })(),
    onFinish: ({ message }) => {
      if (message.parts) {
        const toolParts = message.parts.filter(isVectorSearchToolPart);
        if (toolParts.length > 0) {
          const seenUrls = new Set<string>();
          const newSources: Source[] = [];
          toolParts.forEach((part) => {
            if (part.output?.results) {
              part.output.results.forEach((r: VectorSearchResult) => {
                if (!seenUrls.has(r.url)) {
                  seenUrls.add(r.url);
                  newSources.push({
                    url: r.url,
                    title: r.title,
                    content: r.content,
                  });
                }
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

const initialQuerySentRef = useRef(false);
  const isExistingSession = useRef(false);
  const isLoadingSession = useRef(false);

  useEffect(() => {
    if (!initialQuery) return;
    if (initialQuerySentRef.current) return;
    if (status !== 'ready') return;
    if (messages.length > 0) return;

    const existingSession = findSessionByQuery(initialQuery);
    if (existingSession) {
      isExistingSession.current = true;
      isLoadingSession.current = true;
      setThreadId(existingSession.id);
      setMessages(existingSession.messages);
      setSources(existingSession.sources);
      setTimeout(() => {
        isLoadingSession.current = false;
      }, 100);
      return;
    }

    initialQuerySentRef.current = true;
    sendMessage({ text: initialQuery });
  }, [initialQuery, status, messages.length, sendMessage, setMessages]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (status === 'streaming') return;
    if (isLoadingSession.current) return;

    const sessions = loadSessions();
    const existingIndex = sessions.findIndex(s => s.id === threadId);

    const title = messages[0]?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('')?.slice(0, 50) ?? 'New Chat';

    const existingSession = existingIndex >= 0 ? sessions[existingIndex] : null;
    
    const updatedSession: StoredSession = {
      id: threadId,
      title,
      createdAt: existingSession?.createdAt ?? Date.now(),
      messages,
      sources,
      initialQuery: existingSession?.initialQuery ?? initialQuery,
    };

    if (existingIndex >= 0) {
      sessions[existingIndex] = updatedSession;
    } else {
      sessions.unshift(updatedSession);
    }

    saveSessions(sessions);
    setSessionsVersion(v => v + 1);
  }, [messages, sources, threadId, status, initialQuery]);

  const handleSubmit = useCallback(
    (message: { text: string }) => {
      sendMessage({ text: message.text });
    },
    [sendMessage]
  );

const handleNewChat = useCallback(() => {
    const newId = nanoid();
    setThreadId(newId);
    setMessages([]);
    setSources({});
    initialQuerySentRef.current = false;
    isExistingSession.current = false;
  }, [setMessages]);

const handleSelectSession = useCallback((id: string) => {
    const sessions = loadSessions();
    const session = sessions.find(s => s.id === id);
    if (session) {
      isLoadingSession.current = true;
      setThreadId(id);
      setMessages(session.messages);
      setSources(session.sources);
      setTimeout(() => {
        isLoadingSession.current = false;
      }, 100);
    }
  }, [setMessages]);

  const handleDeleteSession = useCallback((id: string) => {
    const sessions = loadSessions().filter(s => s.id !== id);
    saveSessions(sessions);
    if (id === threadId) {
      handleNewChat();
    }
  }, [threadId, handleNewChat]);

  const lastMessage = messages.at(-1);
  const lastSources = lastMessage ? sources[lastMessage.id] ?? [] : [];

  return (
    <div className="flex h-screen">
<SessionSidebar
        currentThreadId={threadId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        collapsed={sidebarCollapsed}
        sessionsVersion={sessionsVersion}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 h-14 border-b bg-background shrink-0">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-8 h-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
            title="Toggle sidebar"
          >
            <PanelLeftIcon className="w-4 h-4" />
          </button>
          <h1 className="flex-1 text-sm font-medium text-muted-foreground truncate">
            {process.env.NEXT_PUBLIC_APP_NAME}
          </h1>
          <div className="flex items-center gap-2">
            {lastSources.length > 0 && (
              <button
                onClick={() => setShowSources(!showSources)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${showSources
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border hover:border-primary hover:text-primary'
                  }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Sources {lastSources.length}
              </button>
            )}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
              title="Toggle theme"
            >
              {theme === 'dark' ? (
                <SunIcon className="w-4 h-4" />
              ) : (
                <MoonIcon className="w-4 h-4" />
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          <main className="flex-1 flex flex-col min-w-0 relative">
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto p-4 md:p-6 pb-48 md:pb-56">
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
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t z-10">
              <div className="max-w-3xl mx-auto">
                <ChatInput onSubmit={handleSubmit} status={status} />
              </div>
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
