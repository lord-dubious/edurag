'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { MoonIcon, SunIcon, PanelLeftClose, PanelLeftOpen, Phone } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useTheme } from 'next-themes';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

import { authClient } from '@/lib/auth-client-better';
import { Button } from '@/components/ui/button';
import { LoginButton } from "@/components/auth/LoginButton";
import { UserMenu } from "@/components/auth/UserMenu";
import { HistorySidebar } from "@/components/chat/HistorySidebar";
import { useBrand } from '@/components/providers/BrandProvider';
import { VoiceChat, VoiceMessagePayload } from '@/components/voice/VoiceChat';
import { ChatInput } from './ChatInput';
import { ChatMessages } from './ChatMessages';
import { CitationPanel } from './CitationPanel';
import type { Source } from '@edurag/agent/text';

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
  initialVoice?: boolean;
}

const SUGGESTION_POOL = [
  { label: 'Programs', query: 'What programs are offered?' },
  { label: 'Tuition', query: 'How much is tuition?' },
  { label: 'Admissions', query: 'What are the admission requirements?' },
  { label: 'Campus Life', query: 'Tell me about campus life' },
  { label: 'Deadlines', query: 'What are the application deadlines?' },
  { label: 'Scholarships', query: 'What scholarships or financial aid options are available?' },
  { label: 'Housing', query: 'What on-campus housing options are available?' },
  { label: 'International', query: 'What do international students need to apply?' },
  { label: 'Transfer', query: 'How do transfer credits work?' },
  { label: 'Visit', query: 'How can I schedule a campus tour?' },
  { label: 'Contacts', query: 'Who do I contact for admissions help?' },
  { label: 'Outcomes', query: 'What are graduate outcomes or career support like?' },
];

function pickSuggestions<T>(items: T[], count: number, seed: number): T[] {
  let state = Math.floor(seed * 1000000) || 1;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function ChatInterface({ initialQuery, initialVoice }: ChatInterfaceProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [threadId, setThreadId] = useState(() => nanoid());
  const [showHistory, setShowHistory] = useState(true);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [sources, setSources] = useState<Record<string, Source[]>>({});
  const [showSources, setShowSources] = useState(true);
  const [voiceMode, setVoiceMode] = useState(Boolean(initialVoice));
  const [voiceAutoStart, setVoiceAutoStart] = useState(Boolean(initialVoice));
  const [suggestionsSeed, setSuggestionsSeed] = useState(() => Math.random());
  const initialQuerySentRef = useRef(false);
  const { theme, setTheme } = useTheme();
  const { brand } = useBrand();
  const isAuthenticated = Boolean(session?.user);

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
      let newSources: Source[] = [];
      if (message.parts) {
        const toolParts = message.parts.filter(isVectorSearchToolPart);
        if (toolParts.length > 0) {
          newSources = [];
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

      const assistantText = message.parts
        ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof (part as { text?: unknown }).text === 'string')
        .map(part => part.text)
        .join('') ?? '';

      if (session?.user && assistantText.trim()) {
        fetch(`/api/history/${threadId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            id: message.id,
            content: assistantText,
            sources: newSources,
          }),
        }).catch(err => console.error('[Chat] Failed to persist assistant message:', err));
      }
    },
  });

  const handleHistorySelect = async (newThreadId: string) => {
    if (newThreadId === threadId) return;
    setThreadId(newThreadId);
    setMessages([]);
    setSources({});

    try {
      const res = await fetch(`/api/history/${newThreadId}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.messages) {
          const sourcesMap: Record<string, Source[]> = {};
          const uiMessages = data.messages.map((m: { role: string; content: string; timestamp: string; id?: string; sources?: Source[] }) => {
            const id = m.id ?? nanoid();
            if (m.role === 'assistant' && Array.isArray(m.sources) && m.sources.length > 0) {
              sourcesMap[id] = m.sources;
            }
            return {
              id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              parts: [{ type: 'text', text: m.content }],
              createdAt: new Date(m.timestamp)
            };
          });
          setMessages(uiMessages);
          setSources(sourcesMap);
        }
      }
    } catch (e) {
      console.error("Failed to load history", e);
    }
    if (window.innerWidth < 768) {
      setShowHistory(false);
    }
  };

  const handleNewChat = useCallback(() => {
    setThreadId(nanoid());
    setMessages([]);
    setSources({});
    setHistoryRefreshKey(k => k + 1);
    setSuggestionsSeed(Math.random());
    if (window.innerWidth < 768) {
      setShowHistory(false);
    }
  }, [setThreadId, setMessages, setSources, setShowHistory]);

  const handleDeleteConversation = useCallback(async (deleteThreadId: string) => {
    try {
      const res = await fetch(`/api/history/${deleteThreadId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('API delete failed');
    } catch (e) {
      console.error("Failed to delete conversation", e);
      throw e;
    }
    setHistoryRefreshKey(k => k + 1);
    if (deleteThreadId === threadId) {
      handleNewChat();
    }
  }, [threadId, handleNewChat]);

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
  const handleVoiceStart = useCallback(() => {
    if (!isAuthenticated) {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/chat?voice=1')}`);
      return;
    }
    setVoiceAutoStart(true);
    setVoiceMode(true);
  }, [isAuthenticated, router, setVoiceAutoStart, setVoiceMode]);
  const handleVoiceClose = useCallback(() => {
    setVoiceMode(false);
    setVoiceAutoStart(false);
  }, []);

  const formatVoiceHandoffPrompt = useCallback((topic: string) => {
    return `[VOICE_HANDOFF] I am providing the detailed Markdown notes and source links for ${topic} now as requested in our conversation.`;
  }, []);

  const handleVoiceMessage = useCallback((msg: VoiceMessagePayload) => {
    if (msg.role === 'user') {
      const id = nanoid();
      setMessages(prev => [...prev, {
        id,
        role: 'user',
        content: msg.content,
        createdAt: new Date(),
        parts: [{ type: 'text', text: msg.content }],
      }]);

      if (session?.user) {
        fetch(`/api/history/${threadId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'user', id, content: msg.content }),
        }).catch(err => console.error('[Voice] Failed to persist user message:', err));
      }
    } else if (msg.role === 'assistant') {
      if (session?.user) {
        fetch(`/api/history/${threadId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'assistant',
            id: nanoid(),
            content: msg.content,
            sources: msg.sources ?? [],
          }),
        }).catch(err => console.error('[Voice] Failed to persist assistant message:', err));
      }
    }
  }, [setMessages, threadId, session?.user]);

  const pendingNotesRef = useRef<string | null>(null);

  const handleShowNotes = useCallback((topic: string) => {
    if (status !== 'ready') {
      pendingNotesRef.current = topic;
      return;
    }
    sendMessage({ text: formatVoiceHandoffPrompt(topic) });
  }, [status, sendMessage, formatVoiceHandoffPrompt]);

  useEffect(() => {
    if (status === 'ready' && pendingNotesRef.current) {
      const topic = pendingNotesRef.current;
      pendingNotesRef.current = null;
      sendMessage({ text: formatVoiceHandoffPrompt(topic) });
    }
  }, [status, sendMessage, formatVoiceHandoffPrompt]);

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
  const hasSources = lastSources.length > 0;
  const suggestions = useMemo(() => pickSuggestions(SUGGESTION_POOL, 4, suggestionsSeed), [suggestionsSeed]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar for History */}
      {session?.user && showHistory && (
        <div className="w-80 shrink-0 hidden md:flex flex-col border-r h-full">
          <HistorySidebar
            currentId={threadId}
            onSelect={handleHistorySelect}
            onNew={handleNewChat}
            onDelete={handleDeleteConversation}
            isOpen={true}
            refreshKey={historyRefreshKey}
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
                onDelete={handleDeleteConversation}
                isOpen={true}
                refreshKey={historyRefreshKey}
              />
            </div>
          </div>
        </div>
      )}
      {!session?.user && (
        <div className="w-80 shrink-0 hidden md:flex flex-col border-r h-full bg-muted/20">
          <div className="p-6 space-y-3">
            <h2 className="text-sm font-semibold">History</h2>
            <p className="text-sm text-muted-foreground">Sign in to save and revisit your chats.</p>
            <p className="text-xs text-muted-foreground">Keep your admissions questions, compare answers, and pick up where you left off.</p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/auth/signin?callbackUrl=/chat">Sign in</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-4 h-14 border-b bg-background shrink-0">
          {session?.user && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              aria-label="Toggle history"
              title={showHistory ? "Close History" : "Open History"}
            >
              {showHistory ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
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
            <button
              onClick={() => setShowSources(!showSources)}
              disabled={!hasSources}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${hasSources
                ? (showSources
                  ? 'border-primary text-primary bg-primary/10'
                  : 'border-border hover:border-primary hover:text-primary')
                : 'border-border text-muted-foreground bg-muted/40 cursor-not-allowed'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${hasSources ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
              Sources {lastSources.length}
            </button>
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
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.label}
                          onClick={() => handleSuggestionClick(suggestion.query)}
                          className="h-auto py-3 px-4 justify-start text-left gap-2 rounded-md border border-border bg-background hover:bg-accent hover:border-primary/30 transition-all text-sm font-medium"
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="size-3.5" />
                      <span>
                        Prefer voice? Tap the phone icon{isAuthenticated ? ' to start a call.' : ' to sign in and start a call.'}
                      </span>
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
                    onClose={handleVoiceClose}
                    onMessageAdded={handleVoiceMessage}
                    onShowNotes={handleShowNotes}
                    institutionName={appName}
                    autoStart={voiceAutoStart}
                  />
                ) : (
                  <ChatInput
                    onSubmit={handleSubmit}
                    status={status}
                    onVoiceMode={handleVoiceStart}
                    voiceHelperText={isAuthenticated ? undefined : 'Voice requires login'}
                  />
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
