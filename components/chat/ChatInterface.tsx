'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { MoonIcon, SunIcon, PanelLeftClose, PanelLeftOpen, Phone, Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useTheme } from 'next-themes';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type TextUIPart, type UIMessage } from 'ai';

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

interface SearchToolPartWithOutput {
  type: 'tool-vector_search' | 'tool-web_search';
  toolCallId: string;
  state: 'output-available';
  input: { query: string; topK?: number; maxResults?: number };
  output: { found: boolean; results?: unknown };
}

type MessagePart = { type: string; state?: string; output?: unknown };

/**
 * Determines whether a message part represents a completed search tool output.
 *
 * @param part - The message part to inspect
 * @returns `true` if `part` is a `tool-vector_search` or `tool-web_search` with `state` equal to `'output-available'` and an `output` property, `false` otherwise.
 */
function isSearchToolPart(part: MessagePart): part is SearchToolPartWithOutput {
  return (
    (part.type === 'tool-vector_search' || part.type === 'tool-web_search') &&
    part.state === 'output-available' &&
    'output' in part
  );
}

/**
 * Extracts validated source records from message parts produced by search tools.
 *
 * Scans the provided message parts for outputs from `tool-vector_search` or
 * `tool-web_search`, validates each result object, and converts valid entries
 * into `Source` records containing `url`, `content`, optional `title` and
 * numeric `score`, and a `sourceType` of `"vector"` or `"web"`.
 *
 * @param parts - Message parts to inspect for search tool outputs
 * @returns An object with `sources` (the array of extracted `Source` records) and
 * `usedWebFallback` (`true` if any extracted source originated from a web search,
 * `false` otherwise)
 */
function extractSourcesFromMessageParts(parts: MessagePart[]): { sources: Source[]; usedWebFallback: boolean } {
  let sources: Source[] = [];
  let usedWebFallback = false;

  parts.forEach((part) => {
    if (!isSearchToolPart(part)) {
      return;
    }

    const outputResults = part.output?.results;
    if (!Array.isArray(outputResults)) {
      return;
    }

    const sourceType: Source['sourceType'] = part.type === 'tool-web_search' ? 'web' : 'vector';
    const parsedSources: Source[] = [];

    outputResults.forEach((result) => {
      if (typeof result !== 'object' || result === null) {
        return;
      }
      const candidate = result as Record<string, unknown>;
      const url = typeof candidate.url === 'string' ? candidate.url : '';
      const content = typeof candidate.content === 'string' ? candidate.content : '';
      if (!url || !content) {
        return;
      }

      const title = typeof candidate.title === 'string' ? candidate.title : undefined;
      const score = typeof candidate.score === 'number' && Number.isFinite(candidate.score) ? candidate.score : undefined;
      parsedSources.push({
        url,
        title,
        content,
        score,
        sourceType,
      });
    });

    if (parsedSources.length > 0) {
      sources = parsedSources;
      usedWebFallback = sourceType === 'web';
    }
  });

  return { sources, usedWebFallback };
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

/**
 * Renders the main chat UI including message list, input/voice controls, history sidebar, and citation panel.
 *
 * The component manages thread state, history loading/saving, source extraction for assistant messages, suggestion prompts, and optional voice chat handoff behavior.
 *
 * @param initialQuery - Optional initial query to send automatically when the chat is ready and empty
 * @param initialVoice - If true, opens the voice chat UI and attempts auto-start on mount
 * @returns The chat interface React element
 */
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
  const historyLoadIdRef = useRef(0);
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

  const persistHistoryMessage = useCallback(async (
    payload: { role: 'user' | 'assistant'; id?: string; content: string; sources?: Source[] },
    context: string,
  ) => {
    try {
      const res = await fetch(`/api/history/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[History] ${context} failed`, {
          status: res.status,
          body,
        });
      }
    } catch (err) {
      console.error(`[History] ${context} failed`, err);
    }
  }, [threadId]);

  const { messages, setMessages, status, error, sendMessage, regenerate } = useChat({
    id: threadId,
    transport,
    onFinish: async ({ message, messages, isAbort, isDisconnect, isError }) => {
      if (isAbort || isDisconnect || isError) {
        return;
      }

      let extraction = extractSourcesFromMessageParts((message.parts ?? []) as MessagePart[]);
      if (extraction.sources.length === 0) {
        const responseIdx = messages.findIndex(msg => msg.id === message.id);
        if (responseIdx > 0) {
          const previousMessage = messages[responseIdx - 1];
          if (previousMessage.role === 'assistant') {
            extraction = extractSourcesFromMessageParts((previousMessage.parts ?? []) as MessagePart[]);
          }
        }
      }

      if (extraction.sources.length > 0) {
        setSources(prev => ({
          ...prev,
          [message.id]: extraction.sources,
        }));
      }
    },
  });

  const handleHistorySelect = async (newThreadId: string) => {
    if (newThreadId === threadId) return;
    const loadId = ++historyLoadIdRef.current;
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
          if (historyLoadIdRef.current === loadId) {
            setMessages(uiMessages);
            setSources(sourcesMap);
          }
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
  const lastSources = lastSourcedAssistantMessage ? sources[lastSourcedAssistantMessage.id] ?? [] : [];
  const isEmpty = messages.length === 0 && status === 'ready';
  const hasSources = lastSources.length > 0;
  const hasWebFallbackSources = lastSources.some(source => source.sourceType === 'web');
  const suggestions = useMemo(() => pickSuggestions(SUGGESTION_POOL, 4, suggestionsSeed), [suggestionsSeed]);

  return (
    <div className='brand-aurora flex h-screen overflow-hidden'>
      {session?.user && showHistory && (
        <div className='hidden h-full w-80 shrink-0 border-r border-white/45 md:flex dark:border-white/10'>
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
        <div className='fixed inset-0 z-50 bg-background/95 backdrop-blur-sm md:hidden'>
          <div className='h-full flex-col'>
            <div className='flex items-center justify-between border-b px-4 py-3'>
              <h2 className='font-semibold'>History</h2>
              <button onClick={() => setShowHistory(false)} className='rounded-md px-2 py-1 text-sm text-muted-foreground'>
                Close
              </button>
            </div>
            <div className='h-[calc(100%-53px)] overflow-hidden'>
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
        <div className='hidden h-full w-80 shrink-0 border-r border-white/45 bg-background/70 p-5 md:flex md:flex-col dark:border-white/10'>
          <div className='surface-glass space-y-3 rounded-2xl p-4'>
            <h2 className='text-sm font-semibold'>History</h2>
            <p className='text-sm text-muted-foreground'>Sign in to save and revisit your chats.</p>
            <p className='text-xs text-muted-foreground'>
              Keep your admissions questions, compare answers, and continue where you left off.
            </p>
            <Button variant='outline' size='sm' asChild>
              <Link href='/auth/signin?callbackUrl=/chat'>Sign in</Link>
            </Button>
          </div>
        </div>
      )}

      <div className='flex min-w-0 flex-1 flex-col'>
        <header className='flex h-16 shrink-0 items-center gap-3 border-b border-white/45 bg-background/80 px-4 backdrop-blur-md dark:border-white/10 sm:px-5'>
          {session?.user && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className='-ml-1 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
              aria-label='Toggle history'
              title={showHistory ? 'Close History' : 'Open History'}
            >
              {showHistory ? <PanelLeftClose className='h-5 w-5' /> : <PanelLeftOpen className='h-5 w-5' />}
            </button>
          )}

          <div className='flex min-w-0 flex-1 items-center gap-2'>
            {iconType === 'logo' && logoUrl ? (
              <img src={logoUrl} alt={appName} className='h-7 w-auto object-contain' />
            ) : iconType === 'emoji' && emoji ? (
              <span className='text-xl'>{emoji}</span>
            ) : null}
            <div className='min-w-0'>
              <h1 className='truncate text-sm font-semibold tracking-tight text-foreground'>
                {appName}
              </h1>
              <p className='truncate text-[11px] text-muted-foreground'>
                {voiceMode ? 'Voice session active' : 'Text assistant'}
              </p>
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              className='hidden h-8 gap-1.5 rounded-lg border-white/60 bg-background/70 px-2.5 text-xs sm:inline-flex'
              onClick={handleNewChat}
            >
              <Plus className='size-3.5' />
              New chat
            </Button>
            <button
              onClick={() => setShowSources(!showSources)}
              disabled={!hasSources}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${hasSources
                ? (showSources
                  ? 'border-primary bg-primary/12 text-primary'
                  : 'border-white/60 bg-background/70 hover:border-primary hover:text-primary')
                : 'cursor-not-allowed border-border bg-muted/45 text-muted-foreground'
                }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${hasSources ? 'bg-primary' : 'bg-muted-foreground/50'}`} />
              Sources {lastSources.length}
              {hasWebFallbackSources && (
                <span className='rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none'>
                  Web
                </span>
              )}
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className='flex h-8 w-8 items-center justify-center rounded-md border border-white/60 bg-background/70 transition-colors hover:bg-muted dark:border-white/15'
              title='Toggle theme'
            >
              {theme === 'dark' ? (
                <SunIcon className='w-4 h-4' />
              ) : (
                <MoonIcon className='w-4 h-4' />
              )}
            </button>
            {session?.user ? <UserMenu /> : <LoginButton />}
          </div>
        </header>

        <div className='relative flex flex-1 overflow-hidden'>
          <main className='relative flex min-w-0 flex-1 flex-col bg-transparent'>
            <div className='flex-1 overflow-y-auto'>
              <div className='mx-auto w-full max-w-4xl px-4 pb-56 pt-6 sm:px-6 sm:pb-64'>
                {isEmpty && (
                  <div className='surface-glass mx-auto flex min-h-[58vh] max-w-3xl flex-col items-center justify-center rounded-3xl px-6 py-10 text-center'>
                    <div className='mb-7 space-y-2'>
                      <p className='text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground'>
                        Start a conversation
                      </p>
                      <h2 className='text-3xl font-semibold tracking-tight sm:text-4xl'>
                        Welcome to {appName}
                      </h2>
                      <p className='mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base'>
                        Ask about admissions, programs, tuition, deadlines, campus life, and student support in natural language.
                      </p>
                    </div>
                    <div className='grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2'>
                      {suggestions.map((suggestion) => (
                        <button
                          key={suggestion.label}
                          onClick={() => handleSuggestionClick(suggestion.query)}
                          className='rounded-xl border border-white/60 bg-background/80 px-3.5 py-3 text-left text-sm font-medium transition hover:border-primary/35 hover:bg-background'
                        >
                          {suggestion.label}
                        </button>
                      ))}
                    </div>
                    <div className='mt-5 flex items-center gap-2 text-xs text-muted-foreground'>
                      <Phone className='size-3.5' />
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
                  <div className='mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive'>
                    <span>Something went wrong.</span>
                    <button
                      onClick={() => regenerate()}
                      className='font-medium underline'
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className={`absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-background via-background/96 to-transparent px-3 py-4 sm:px-5 ${voiceMode ? 'bg-background pb-6' : ''}`}>
              <div className='mx-auto max-w-4xl'>
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
