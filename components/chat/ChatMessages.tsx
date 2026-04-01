'use client';

import { type UIMessage, type ChatStatus, type TextUIPart } from 'ai';
import {
  Message,
  MessageContent,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message';
import { Streamdown, type AllowedTags } from 'streamdown';
import { cjk } from '@streamdown/cjk';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { CopyIcon, RefreshCcwIcon, ExternalLinkIcon, MessageCircleQuestionIcon, FileTextIcon } from 'lucide-react';
import { Fragment, useMemo, memo } from 'react';

const CITATION_REGEX = /(?:\[([^\]]+)\]\(cite:(\d+)\))|(?:【(\d+)(?:†[^】]+)?】|\[(\d+)\])/g;

const streamdownPlugins = { cjk, code, math, mermaid };

const CITATION_ALLOWED_TAGS: AllowedTags = {
  'cite-ref': ['data-index', 'data-url', 'data-title'],
};

/**
 * Preprocess text to extract LLM-chosen source titles and convert to html.
 * [Clean Title](cite:1) → <cite-ref data-index="0" data-title="Clean Title" ... />
 */
function preprocessCitations(text: string, sources: Source[]): string {
  return text.replace(CITATION_REGEX, (_match, customTitle, g2, g3, g4) => {
    const citationIndex = parseInt(g2 ?? g3 ?? g4, 10) - 1;
    const source = sources[citationIndex];
    if (source) {
      const safeUrl = source.url.replace(/"/g, '&quot;');
      const finalTitle = customTitle || source.title || '';
      const safeTitle = finalTitle.replace(/"/g, '&quot;');
      return `<cite-ref data-index="${citationIndex}" data-url="${safeUrl}" data-title="${safeTitle}" />`;
    }
    return _match;
  });
}

function cleanSourceContent(content: string, maxLength = 150): string {
  if (!content) return '';
  return content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .replace(/\s+\S*$/, '');
}

interface Source {
  url: string;
  title?: string;
  content: string;
  sourceType?: 'vector' | 'web';
}

interface Props {
  messages: UIMessage[];
  sources: Record<string, Source[]>;
  status: ChatStatus;
  onRegenerate: () => void;
}

/**
 * Normalize and validate a URL string and return it only for `http` or `https` schemes.
 *
 * @returns The normalized URL string if `url` parses and has protocol `http:` or `https:`, `null` otherwise.
 */
function getSafeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a sanitized hostname from a URL string, removing a leading `www.`.
 *
 * @param url - The input URL string to parse.
 * @returns The hostname with a leading `www.` removed, or `"source"` if the URL cannot be parsed or yields an empty hostname.
 */
function getSourceHostname(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return hostname || 'source';
  } catch {
    return 'source';
  }
}

/**
 * Renders a clickable citation "chip" that displays a numbered badge and a title and links to the source when the URL is safe.
 *
 * The component uses the provided `customTitle` if present, otherwise falls back to `source.title` or a hostname-derived label. If the source URL is not an http(s) URL, the chip renders a placeholder link (`'#'`) and prevents navigation; the tooltip indicates when the source URL is unavailable.
 *
 * @param index - Zero-based citation index (displayed as `index + 1` in the badge)
 * @param source - Source metadata containing at least `url` and optionally `title`/`content`
 * @param customTitle - Optional override for the displayed title
 * @returns The JSX element representing the citation chip
 */
function CitationChip({ index, source, customTitle }: { index: number; source: Source; customTitle?: string }) {
  const safeHref = getSafeHref(source.url);
  const displayTitle = customTitle || source.title || getSourceHostname(source.url);
  return (
    <a
      href={safeHref ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={safeHref ? undefined : (event) => event.preventDefault()}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-full text-[11px] font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer no-underline group"
      title={safeHref ?? 'Unavailable source URL'}
    >
      <span className="flex size-[16px] shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-mono text-primary-foreground group-hover:bg-primary-foreground/30 transition-colors">
        {index + 1}
      </span>
      {displayTitle}
    </a>
  );
}

/**
 * Render a clickable source card showing a numbered badge, title, truncated snippet, and domain.
 *
 * @param index - Zero-based index of the source (used to render the 1-based badge).
 * @param source - The citation source object containing at least `url` and `content`; `title` may be present.
 * @param customTitle - Optional override for the displayed title; used instead of `source.title` or the hostname.
 * @returns The JSX anchor element for the styled source card; links to the source URL when it is a safe http(s) href. */
function SourceCard({ index, source, customTitle }: { index: number; source: Source; customTitle?: string }) {
  const safeHref = getSafeHref(source.url);
  const domain = getSourceHostname(source.url);
  const displayTitle = customTitle || source.title || domain;

  return (
    <a
      href={safeHref ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      onClick={safeHref ? undefined : (event) => event.preventDefault()}
      className="group flex items-start gap-3 p-3 rounded-lg border border-border bg-card hover:border-primary/50 hover:bg-accent/50 transition-colors cursor-pointer no-underline"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <span className="text-xs font-mono font-bold text-primary">{index + 1}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground group-hover:text-primary">
            {displayTitle}
          </span>
          <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {cleanSourceContent(source.content)}
        </p>
        <span className="text-[10px] text-muted-foreground/70">{domain}</span>
      </div>
    </a>
  );
}

/** Streamdown-powered markdown renderer with citation support */
const RenderedMessage = memo(function RenderedMessage({ text, sources }: { text: string; sources: Source[] }) {
  const processed = useMemo(() => preprocessCitations(text, sources), [text, sources]);

  const citationComponents = useMemo(() => ({
    'cite-ref': (props: Record<string, unknown>) => {
      const idx = parseInt(String(props['data-index'] ?? '0'), 10);
      const customTitle = props['data-title'] as string | undefined;
      const source = sources[idx];
      if (source) {
        return <CitationChip index={idx} source={source} customTitle={customTitle} />;
      }
      return (
        <span className="inline-flex items-center justify-center size-[16px] bg-muted rounded-full text-[10px] text-muted-foreground">
          {idx + 1}
        </span>
      );
    },
  }), [sources]);

  return (
    <Streamdown
      className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
      plugins={streamdownPlugins}
      allowedTags={CITATION_ALLOWED_TAGS}
      components={citationComponents}
    >
      {processed}
    </Streamdown>
  );
}, (prev, next) => prev.text === next.text && prev.sources === next.sources);

/**
 * Render the chat transcript including message bubbles, source panels, and per-assistant actions.
 *
 * Renders an empty-state when there are no messages. For each message it displays text parts, tool progress rows, a voice-handoff note, and — for assistant messages with attached sources — a compact sources panel with up to six source cards. When the last assistant message is ready it shows Copy and Regenerate actions.
 *
 * @param messages - Array of UIMessage objects representing the chat transcript
 * @param sources - Mapping from message id to an array of Source entries used to render citation chips and source cards
 * @param status - Current chat status; controls rendering of action buttons and certain fallbacks
 * @param onRegenerate - Callback invoked when the user triggers the "Regenerate" action
 * @returns The rendered chat messages React element
 */
export function ChatMessages({ messages, sources, status, onRegenerate }: Props) {

  if (messages.length === 0) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <MessageCircleQuestionIcon className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h3 className="font-medium text-sm">Ask anything about the university</h3>
          <p className="text-xs text-muted-foreground">
            I can help with admissions, programs, tuition, campus life, and more.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message, idx) => {
        const isLast = idx === messages.length - 1;
        const msgSources = sources[message.id] ?? [];

        // Pre-parse text parts to find custom source titles generated by LLM
        const extractedTitles: Record<number, string> = {};
        message.parts.forEach(part => {
          if (part.type === 'text') {
            const matches = Array.from((part as TextUIPart).text.matchAll(CITATION_REGEX));
            matches.forEach(m => {
              const customTitle = m[1];
              const citationIndex = parseInt(m[2] ?? m[3] ?? m[4], 10) - 1;
              if (customTitle && !extractedTitles[citationIndex]) {
                extractedTitles[citationIndex] = customTitle;
              }
            });
          }
        });

        return (
          <Fragment key={message.id}>
            {(() => {
              const firstTextPart = message.parts.find(p => p.type === 'text') as TextUIPart | undefined;
              const isVoiceHandoff = message.role === 'user' && firstTextPart?.text?.startsWith('[VOICE_HANDOFF]');

              if (isVoiceHandoff) {
                return (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-4 py-2 animate-in fade-in duration-300">
                    <FileTextIcon className="size-3.5" />
                    <span className="italic">Generating detailed notes from voice request...</span>
                  </div>
                );
              }

              return (
                <Message from={message.role} className="animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300">
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      if (part.type === 'text') {
                        const text = (part as TextUIPart).text;
                        return <RenderedMessage key={`${message.id}-${i}`} text={text} sources={msgSources} />;
                      }
                      if (part.type.startsWith('tool-')) {
                        const toolLabel = part.type === 'tool-web_search'
                          ? 'Searching web fallback...'
                          : 'Searching knowledge base...';
                        return (
                          <div key={`${message.id}-${i}`} className="flex items-center gap-2 text-sm text-muted-foreground px-4 py-2">
                            <svg className="animate-spin size-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            <span>{toolLabel}</span>
                          </div>
                        );
                      }
                      return null;
                    })}
                    {!message.parts.some(p => p.type === 'text') && message.role === 'assistant' && status === 'ready' && (
                      <Streamdown className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" plugins={streamdownPlugins}>
                        I found relevant information but couldn&apos;t generate a proper response. Please try rephrasing your question.
                      </Streamdown>
                    )}
                  </MessageContent>
                </Message>
              );
            })()}

            {message.role === 'assistant' && isLast && status === 'ready' && (
              <MessageActions>
                <MessageAction
                  label="Copy"
                  onClick={() => {
                    const text = message.parts
                      .filter((p): p is TextUIPart => p.type === 'text')
                      .map(p => p.text)
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
              <div className="px-4 pb-2 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-150 fill-mode-both">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <FileTextIcon className="size-4" />
                  <span>Sources ({msgSources.length})</span>
                </div>
                <div className="grid gap-2">
                  {msgSources.slice(0, 6).map((source, i) => (
                    <SourceCard key={`${source.url}-${i}`} index={i} source={source} customTitle={extractedTitles[i]} />
                  ))}
                </div>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
