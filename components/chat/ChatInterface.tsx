'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { nanoid } from 'nanoid';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { MoonIcon, SunIcon, Menu, History } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSession } from "next-auth/react";
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';
import { CitationPanel } from './CitationPanel';
import { VoiceChat, VoiceMessagePayload } from '@/components/voice/VoiceChat';
import { useBrand } from '@/components/providers/BrandProvider';
import { LoginButton } from "@/components/auth/LoginButton";
import { UserMenu } from "@/components/auth/UserMenu";
import { HistorySidebar } from "@/components/chat/HistorySidebar";
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

interface ChatInterfaceProps {
  initialQuery?: string;
}

const SUGGESTIONS = [
  { label: 'Programs', query: 'What programs are offered?' },
  { label: 'Tuition', query: 'How much is tuition?' },
  { label: 'Admissions', query: 'What are the admission requirements?' },
  { label: 'Campus Life', query: 'Tell me about campus life' },
];

export function ChatInterface({ initialQuery }: ChatInterfaceProps) {
  const { data: session } = useSession();
  const [threadId, setThreadId] = useState(() => nanoid());
  const [showHistory, setShowHistory] = useState(false);

  const [sources, setSources] = useState<Record<string, Source[]>>({});
  const [showSources, setShowSources] = useState(true);
  const [voiceMode, setVoiceMode] = useState(false);
  const initialQuerySentRef = useRef(false);
  const { theme, setTheme } = useTheme();
  const { brand } = useBrand();

  const appName = brand?.appName || 'University Knowledge Base';
  const logoUrl = brand?.logoUrl;
  const emoji = brand?.emoji;
  const iconType = brand?.iconType || 'emoji';

  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({ threadId }),
  }), [threadId]);

  const { messages, setMessages, status, error, sendMessage, regenerate } = useChat({
    id: threadId,
    transport,
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

  const handleHistorySelect = async (newThreadId: string) => {
    if (newThreadId === threadId) return;
    setThreadId(newThreadId);
    setMessages([]); // Clear while loading

    try {
      const res = await fetch(`/api/history/${newThreadId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.messages) {
          const uiMessages = data.messages.map((m: { role: string; content: string; timestamp: string }) => ({
            id: nanoid(),
            role: m.role as 'user' | 'assistant',
            content: m.content,
            parts: [{ type: 'text', text: m.content }],
            createdAt: new Date(m.timestamp)
          }));
          setMessages(uiMessages);
        }
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
    // On mobile, close sidebar after selection
    if (window.innerWidth < 768) {
        setShowHistory(false);
    }
  };

  const handleNewChat = () => {
    setThreadId(nanoid());
    setMessages([]);
    setSources({});
    if (window.innerWidth < 768) {
        setShowHistory(false);
    }
  };

  useEffect(() => {
    if (!initialQuery) return;
    if (initialQuerySentRef.current) return;
    if (status !== 'ready') return;
    if (messages.length > 0) return;

    initialQuerySentRef.current = true;
    sendMessage({ text: initialQuery });
  }, [initialQuery, status, messages.length, sendMessage]);

  const handleSubmit = useCallback(
    (message: { text: string }) => {
      sendMessage({ text: message.text });
    },
    [sendMessage]
  );

  const handleVoiceMessage = useCallback((msg: VoiceMessagePayload) => {
    const id = nanoid();
    setMessages(prev => [...prev, {
      id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      createdAt: new Date(),
      parts: [{ type: 'text', text: msg.content }],
    }]);

    if (msg.sources && msg.sources.length > 0) {
      setSources(prev => ({
        ...prev,
        [id]: msg.sources!
      }));
    }
  }, [setMessages]);

  const handleShowNotes = useCallback((topic: string) => {
    if (status !== 'ready') return;
    sendMessage({ text: `[VOICE_HANDOFF] The user asked about "${topic}" via voice. Search the knowledge base and provide a comprehensive, detailed answer with proper source citations and links.` });
  }, [status, sendMessage]);

  const handleSuggestionClick = useCallback(
    (query: string) => {
      if (status === 'ready') {
        sendMessage({ text: query });
      }
    },
    [status, sendMessage]
  );

  const lastMessage = messages.at(-1);
  const lastSources = lastMessage ? sources[lastMessage.id] ?? [] : [];
  const isEmpty = messages.length === 0 && status === 'ready';

  return (
    <div className="flex h-screen overflow-hidden">
        {/* Sidebar for History */}
        {session?.user && showHistory && (
            <div className="w-64 border-r shrink-0 hidden md:block">
                <HistorySidebar
                    currentId={threadId}
                    onSelect={handleHistorySelect}
                    onNew={handleNewChat}
                    isOpen={true}
                />
            </div>
        )}
        {session?.user && showHistory && (
            <div className="fixed inset-0 z-50 bg-background md:hidden">
                <div className="h-full flex flex-col">
                     <div className="p-4 border-b flex justify-between items-center">
                        <h2 className="font-semibold">History</h2>
                        <button onClick={() => setShowHistory(false)}>Close</button>
                     </div>
                     <div className="flex-1 overflow-hidden">
                        <HistorySidebar
                            currentId={threadId}
                            onSelect={handleHistorySelect}
                            onNew={handleNewChat}
                            isOpen={true}
                        />
                     </div>
                </div>
            </div>
        )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 h-14 border-b bg-background shrink-0">
            {session?.user && (
                <button
                    onClick={() => setShowHistory(!showHistory)}
                    className="p-2 -ml-2 hover:bg-muted rounded-md transition-colors"
                    aria-label="Toggle history"
                >
                    {showHistory ? <Menu className="h-5 w-5" /> : <History className="h-5 w-5" />}
                </button>
            )}

          <div className="flex items-center gap-2 flex-1 min-w-0">
            {iconType === 'logo' && logoUrl ? (
              <img src={logoUrl} alt={appName} className="h-7 w-auto object-contain" />
            ) : iconType === 'emoji' && emoji ? (
              <span className="text-xl">{emoji}</span>
            ) : null}
            <h1 className="text-sm font-medium text-muted-foreground truncate">
              {appName}
            </h1>
          </div>
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
            {session?.user ? <UserMenu /> : <LoginButton />}
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
            <main className="flex-1 flex flex-col min-w-0 relative bg-background">
                <div className="flex-1 overflow-y-auto">
                <div className="max-w-3xl mx-auto p-4 md:p-6 pb-48 md:pb-56">
                    {isEmpty && (
                    <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-6">
                        <div className="space-y-2">
                        <h2 className="text-2xl font-semibold">Welcome to {appName}</h2>
                        <p className="text-muted-foreground max-w-md">
                            Ask me anything about admissions, programs, tuition, campus life, and more.
                        </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 w-full max-w-md">
                        {SUGGESTIONS.map((suggestion) => (
                            <button
                            key={suggestion.label}
                            onClick={() => handleSuggestionClick(suggestion.query)}
                            className="h-auto py-3 px-4 justify-start text-left gap-2 rounded-md border border-border bg-background hover:bg-accent hover:border-primary/30 transition-all text-sm font-medium"
                            >
                            {suggestion.label}
                            </button>
                        ))}
                        </div>
                    </div>
                    )}
                    {!isEmpty && (
                    <ChatMessages
                        messages={messages}
                        sources={sources}
                        status={status}
                        onRegenerate={regenerate}
                    />
                    )}
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

                <div className={`absolute bottom-0 left-0 right-0 py-4 px-2 sm:px-4 bg-gradient-to-t from-background via-background/95 to-transparent z-10
                    ${voiceMode ? "bg-background pb-6" : ""}`}>
                <div className="max-w-3xl mx-auto">
                    {voiceMode ? (
                    <VoiceChat
                        messages={messages}
                        onClose={() => setVoiceMode(false)}
                        onMessageAdded={handleVoiceMessage}
                        onShowNotes={handleShowNotes}
                        institutionName={appName}
                    />
                    ) : (
                    <ChatInput onSubmit={handleSubmit} status={status} onVoiceMode={() => setVoiceMode(true)} />
                    )}
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
