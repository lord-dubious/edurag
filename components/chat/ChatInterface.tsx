'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { PanelLeftIcon, MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { SessionSidebar } from './SessionSidebar';
import { CitationPanel } from './CitationPanel';
import { SESSIONS_STORAGE_KEY } from '@/lib/constants';
import type { Source } from '@/lib/agent/types';

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

export function loadSessions(): StoredSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(SESSIONS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: StoredSession[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
}

export function findSessionByQuery(query: string): StoredSession | undefined {
  const sessions = loadSessions();
  const normalizedQuery = query.trim().toLowerCase();
  return sessions.find(s => s.initialQuery?.trim().toLowerCase() === normalizedQuery);
}

interface ChatInterfaceProps {
  initialQuery?: string;
}

export function ChatInterface({ initialQuery }: ChatInterfaceProps) {
  const initialSessionsRef = useRef<StoredSession[] | null>(null);
  if (initialSessionsRef.current === null) {
    initialSessionsRef.current = loadSessions();
  }
  const initialSessions = initialSessionsRef.current;
  
  const initialThreadId = useMemo(() => {
    if (initialQuery) {
      return findSessionByQuery(initialQuery)?.id ?? nanoid();
    }
    return initialSessions.length > 0 ? initialSessions[0].id : nanoid();
  }, [initialQuery, initialSessions]);
  
  const [threadId, setThreadId] = useState(initialThreadId);
  const [sources, setSources] = useState<Record<string, Source[]>>(() => {
    const session = initialSessions.find(s => s.id === initialThreadId);
    return session?.sources ?? {};
  });
  const [showSources, setShowSources] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionsVersion, setSessionsVersion] = useState(0);
  const [pendingInput, setPendingInput] = useState<string | null>(null);
  const isLoadingSessionRef = useRef(false);
  const { theme, setTheme } = useTheme();

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({ threadId }),
  }), [threadId]);

  const { messages, status, error, sendMessage, regenerate, setMessages } = useChat({
    id: threadId,
    transport,
    messages: (() => {
      if (initialQuery) return [];
      const session = initialSessions.find(s => s.id === initialThreadId);
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

  useEffect(() => {
    if (!initialQuery) return;
    if (initialQuerySentRef.current) return;
    if (status !== 'ready') return;
    if (messages.length > 0) return;

    const existingSession = findSessionByQuery(initialQuery);
    if (existingSession) {
      isLoadingSessionRef.current = true;
      setThreadId(existingSession.id);
      setMessages(existingSession.messages);
      setSources(existingSession.sources);
      initialQuerySentRef.current = true;
      return;
    }

    setPendingInput(initialQuery);
    initialQuerySentRef.current = true;
  }, [initialQuery, status, messages.length, setMessages]);

  useEffect(() => {
    if (status === 'ready' && isLoadingSessionRef.current) {
      isLoadingSessionRef.current = false;
      return;
    }
    
    if (messages.length === 0) return;
    if (status === 'streaming') return;
    if (isLoadingSessionRef.current) return;

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
      initialQuery: existingSession ? existingSession.initialQuery : initialQuery,
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
    setPendingInput(null);
    initialQuerySentRef.current = true;
  }, [setMessages]);

  const handleSelectSession = useCallback((id: string) => {
    const sessions = loadSessions();
    const session = sessions.find(s => s.id === id);
    if (session) {
      isLoadingSessionRef.current = true;
      setThreadId(id);
      setMessages(session.messages);
      setSources(session.sources);
      setPendingInput(null);
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
                <ChatInput onSubmit={handleSubmit} status={status} defaultInput={pendingInput ?? undefined} />
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
