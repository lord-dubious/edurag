'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';

import { MoonIcon, SunIcon, PanelLeftClose, PanelLeftOpen, Phone } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useTheme } from 'next-themes';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type TextUIPart, type UIMessage } from 'ai';

import { authClient } from '@/lib/auth-client-better';
import { LoginButton } from "@/components/auth/LoginButton";
import { UserMenu } from "@/components/auth/UserMenu";
import { HistorySidebar } from "@/components/chat/HistorySidebar";
import { useConversationHistory } from '@/components/chat/useConversationHistory';
import { useBrand } from '@/components/providers/BrandProvider';
import { VoiceChat, VoiceMessagePayload } from '@/components/voice/VoiceChat';
import { extractSourcesFromSearchParts } from '@/lib/chat/sources';
import { ChatInput } from './ChatInput';
import { ChatMessages } from './ChatMessages';
import { SourcesPanel } from './SourcesPanel';
import type { Source } from '@edurag/agent/text';

type MessagePart = { type: string; state?: string; output?: unknown };

function extractSourcesFromMessageParts(parts: MessagePart[]): { sources: Source[]; usedWebFallback: boolean } {
  return extractSourcesFromSearchParts(parts);
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

function describeChatError(error: Error | undefined): { title: string; body: string } {
  const message = error?.message?.trim();
  if (!message) {
    return {
      title: 'Something went wrong',
      body: 'Try again or start a fresh chat.',
    };
  }

  const lower = message.toLowerCase();
  if (lower.includes('abort')) {
    return {
      title: 'Response stopped early',
      body: 'You can regenerate the last answer or continue with a follow-up question.',
    };
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return {
      title: 'Connection issue',
      body: 'Check your connection and retry the last answer when you are ready.',
    };
  }
  if (lower.includes('rate') || lower.includes('too many')) {
    return {
      title: 'Temporarily rate limited',
      body: 'Wait a moment, then retry the last answer.',
    };
  }

  return {
    title: 'Something went wrong',
    body: message,
  };
}

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
  const [showHistory, setShowHistory] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const [sources, setSources] = useState<Record<string, Source[]>>({});
  const [showSources, setShowSources] = useState(false);
  const [selectedSourcesMessageId, setSelectedSourcesMessageId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(Boolean(initialVoice));
  const [voiceAutoStart, setVoiceAutoStart] = useState(Boolean(initialVoice));
  const [suggestionsSeed, setSuggestionsSeed] = useState(1);
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

  const { messages, setMessages, status, error, sendMessage, regenerate, stop } = useChat({
    id: threadId,
    transport,
    onFinish: async ({ message, isAbort, isDisconnect, isError }) => {
      if (isAbort || isDisconnect || isError) {
        return;
      }

      const extraction = extractSourcesFromMessageParts((message.parts ?? []) as MessagePart[]);

      if (extraction.sources.length > 0) {
        setSources(prev => ({
          ...prev,
          [message.id]: extraction.sources,
        }));
      }
    },
  });

  const {
    persistHistoryMessage,
    handleHistorySelect,
    handleNewChat,
    handleDeleteConversation,
  } = useConversationHistory({
    threadId,
    setThreadId,
    setHistoryRefreshKey,
    setMessages,
    setSources,
    onCompactNavigate: () => setShowHistory(false),
  });

  const handleStartNewChat = useCallback(() => {
    handleNewChat();
    setSuggestionsSeed((current) => current + 1);
  }, [handleNewChat]);

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

  const handleVoiceMessage = useCallback(async (msg: VoiceMessagePayload) => {
    if (msg.role === 'user') {
      const id = nanoid();
      const textPart: TextUIPart = { type: 'text', text: msg.content };
      setMessages(prev => [...prev, {
        id,
        role: 'user',
        content: msg.content,
        createdAt: new Date(),
        parts: [textPart],
      }]);

      if (session?.user) {
        await persistHistoryMessage({
          role: 'user',
          id,
          content: msg.content,
        }, 'voice user message');
      }
    } else if (msg.role === 'assistant') {
      const id = nanoid();
      const textPart: TextUIPart = { type: 'text', text: msg.content };
      const assistantMessage: UIMessage & { content: string; createdAt: Date } = {
        id,
        role: 'assistant' as const,
        content: msg.content,
        createdAt: new Date(),
        parts: [textPart],
      };
      setMessages(prev => [...prev, assistantMessage]);
      if (msg.sources && msg.sources.length > 0) {
        setSources(prev => ({
          ...prev,
          [id]: msg.sources ?? [],
        }));
      }
      if (session?.user) {
        await persistHistoryMessage({
          role: 'assistant',
          id,
          content: msg.content,
          sources: msg.sources ?? [],
        }, 'voice assistant message');
      }
    }
  }, [setMessages, setSources, persistHistoryMessage, session?.user]);

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

  const lastSourcedAssistantMessage = [...messages]
    .reverse()
    .find(message => message.role === 'assistant' && (sources[message.id]?.length ?? 0) > 0);
  const lastAssistantMessage = [...messages].reverse().find(message => message.role === 'assistant');
  const selectedSourcesAvailable = selectedSourcesMessageId
    ? (sources[selectedSourcesMessageId]?.length ?? 0) > 0
    : false;
  const activeSourcesMessageId = selectedSourcesAvailable
    ? selectedSourcesMessageId
    : lastSourcedAssistantMessage?.id ?? null;
  const lastSources = activeSourcesMessageId ? sources[activeSourcesMessageId] ?? [] : [];
  const isEmpty = messages.length === 0 && status === 'ready';
  const hasSources = lastSources.length > 0;
  const hasWebFallbackSources = lastSources.some(source => source.sourceType === 'web');
  const suggestions = useMemo(() => pickSuggestions(SUGGESTION_POOL, 4, suggestionsSeed), [suggestionsSeed]);
  const followUpSuggestions = useMemo(() => pickSuggestions(SUGGESTION_POOL, 3, suggestionsSeed + 1), [suggestionsSeed]);
  const chatErrorCopy = useMemo(() => describeChatError(error), [error]);
  const showFollowUpSuggestions = messages.length > 0 && status === 'ready';

  const handleOpenSources = useCallback((messageId?: string) => {
    const nextMessageId = messageId ?? lastSourcedAssistantMessage?.id;
    if (!nextMessageId || (sources[nextMessageId]?.length ?? 0) === 0) {
      return;
    }

    setSelectedSourcesMessageId(nextMessageId);
    setShowSources(true);
  }, [lastSourcedAssistantMessage, sources]);

  return (
    <div className="flex h-screen overflow-hidden">
      {session?.user && showHistory && (
        <div className="w-80 shrink-0 hidden md:flex flex-col border-r h-full">
          <HistorySidebar
            currentId={threadId}
            onSelect={handleHistorySelect}
            onNew={handleStartNewChat}
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
                onNew={handleStartNewChat}
                onDelete={handleDeleteConversation}
                isOpen={true}
                refreshKey={historyRefreshKey}
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
                onClick={() => {
                  if (showSources) {
                    setShowSources(false);
                    return;
                  }
                  handleOpenSources();
                }}
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
              {hasWebFallbackSources && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                  Web
                </span>
              )}
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
                        {isAuthenticated ? 'Prefer voice? Tap the phone icon.' : 'Prefer voice? Sign in and tap the phone icon.'}
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
                    latestSourcesMessageId={lastSourcedAssistantMessage?.id}
                    onOpenSources={handleOpenSources}
                  />
                )}
                {showFollowUpSuggestions && !error && (
                  <div className="mt-6 flex flex-wrap items-center gap-2 px-1">
                    <span className="text-xs text-muted-foreground">Try next:</span>
                    {followUpSuggestions.map((suggestion) => (
                      <button
                        key={`follow-up-${suggestion.label}`}
                        onClick={() => handleSuggestionClick(suggestion.query)}
                        className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                )}
                {error && (
                  <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm">
                    <div className="space-y-1">
                      <p className="font-medium text-destructive">{chatErrorCopy.title}</p>
                      <p className="text-muted-foreground">{chatErrorCopy.body}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {lastAssistantMessage && (
                        <button
                          onClick={() => regenerate()}
                          className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90"
                        >
                          Retry last answer
                        </button>
                      )}
                      <button
                        onClick={handleStartNewChat}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        Start fresh chat
                      </button>
                    </div>
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
                    onStop={stop}
                    onVoiceMode={handleVoiceStart}
                    voiceHelperText={isAuthenticated ? undefined : 'Sign in for voice'}
                  />
                )}
              </div>
            </div>
          </main>

          {showSources && lastSources.length > 0 && (
            <SourcesPanel
              sources={lastSources}
              title={activeSourcesMessageId === lastSourcedAssistantMessage?.id ? 'Sources for latest answer' : 'Sources for selected answer'}
              isOpen={showSources}
              onClose={() => setShowSources(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
