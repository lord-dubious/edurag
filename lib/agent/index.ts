import { runAgent as _runAgent } from '@edurag/agent/text';
import { createOpenAI } from '@ai-sdk/openai';
import { tavily } from '@tavily/core';
import { chatModel } from '../providers';
import { similaritySearchWithScore } from '../vectorstore';
import { getPublicFaqs } from '../faq-manager';
import { env } from '../env';
import { getSettings } from '../db/settings';
import type { AgentOptions } from '@edurag/agent/text';
import type { WebSearchResult } from '@edurag/agent/text';

interface TavilyRawResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  rawContent?: unknown;
  score?: unknown;
}

interface TavilySearchResponseLike {
  results?: unknown;
}

/**
 * Normalize whitespace in a search content string.
 *
 * @param input - Value to normalize; non-string values are treated as empty.
 * @returns The input with consecutive whitespace collapsed to single spaces and trimmed; an empty string if `input` is not a string.
 */
function normalizeSearchContent(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the hostname from a URL string, stripping a leading `www.` if present.
 *
 * @param input - The URL string to parse (may be `undefined`)
 * @returns The hostname without a leading `www.` if `input` is a valid URL, `null` otherwise
 */
function getHostname(input: string | undefined): string | null {
  if (!input) {
    return null;
  }

  try {
    return new URL(input).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Appends the institution name to a search query when both are non-empty and the query does not already contain the institution name.
 *
 * @param query - The original search query
 * @param institutionName - The institution name to append if it is not already present in `query` (case-insensitive)
 * @returns The resulting query: if one input is empty, returns the other; if `query` already contains `institutionName` (case-insensitive), returns `query`; otherwise returns `query` and `institutionName` joined by a single space
 */
function buildContextualWebQuery(query: string, institutionName: string): string {
  const normalizedQuery = query.trim();
  const normalizedInstitution = institutionName.trim();

  if (!normalizedInstitution) {
    return normalizedQuery;
  }

  if (!normalizedQuery) {
    return normalizedInstitution;
  }

  if (normalizedQuery.toLowerCase().includes(normalizedInstitution.toLowerCase())) {
    return normalizedQuery;
  }

  return `${normalizedQuery} ${normalizedInstitution}`;
}

/**
 * Configure and execute the conversational agent using provided options and persisted settings.
 *
 * @param options - Agent runtime options (controls model overrides, maxSteps, maxTokens, temperature, and optional universityName used to contextualize web searches).
 * @returns The agent execution result produced by the runner (response payload from the agent).
 */
export async function runAgent(options: AgentOptions) {
  const settings = await getSettings();
  const institutionName = (options.universityName || settings?.appName || '').trim();
  const chatConfig = settings?.chatConfig;
  const modelName = chatConfig?.model || env.CHAT_MODEL;
  const baseURL = chatConfig?.baseUrl || env.CHAT_BASE_URL;
  const apiKey = chatConfig?.apiKey || env.CHAT_API_KEY;
  const hasOverrides = Boolean(chatConfig?.model || chatConfig?.baseUrl || chatConfig?.apiKey);
  const model = hasOverrides
    ? createOpenAI({ apiKey, baseURL }).chat(modelName)
    : chatModel;
  const maxSteps = options.maxSteps ?? chatConfig?.maxSteps ?? env.CHAT_MAX_STEPS;
  const maxTokens = options.maxTokens ?? chatConfig?.maxTokens ?? env.CHAT_MAX_TOKENS;
  const temperature = options.temperature ?? chatConfig?.temperature ?? env.CHAT_TEMPERATURE;
  const tavilyApiKey = settings?.tavilyApiKey || env.TAVILY_API_KEY;
  const preferredDomains = Array.from(new Set([
    getHostname(settings?.uniUrl),
    ...(settings?.externalUrls ?? []).map(url => getHostname(url)),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)));

  const webSearchFn = tavilyApiKey
    ? async (query: string, maxResults: number): Promise<WebSearchResult[]> => {
      try {
        const client = tavily({ apiKey: tavilyApiKey });
        const response = await client.search(buildContextualWebQuery(query, institutionName), {
          searchDepth: 'advanced',
          topic: 'general',
          maxResults: Math.min(10, Math.max(1, maxResults)),
          includeRawContent: 'text',
          includeDomains: preferredDomains.length > 0 ? preferredDomains : undefined,
        }) as unknown as TavilySearchResponseLike;

        if (!Array.isArray(response.results)) {
          return [];
        }

        return response.results
          .filter((result): result is TavilyRawResult => typeof result === 'object' && result !== null)
          .map((result) => {
            const rawContent = normalizeSearchContent(result.rawContent);
            const snippet = normalizeSearchContent(result.content);
            return {
              url: typeof result.url === 'string' ? result.url.trim() : '',
              title: typeof result.title === 'string' && result.title.trim().length > 0
                ? result.title.trim()
                : undefined,
              content: rawContent || snippet,
              score: typeof result.score === 'number' && Number.isFinite(result.score) ? result.score : 0,
            };
          })
          .filter(result => result.url.length > 0 && result.content.length > 0);
      } catch (error) {
        console.error('[web_search] Tavily fallback failed:', error);
        return [];
      }
    }
    : undefined;

  return _runAgent(
    {
      model,
      searchFn: similaritySearchWithScore,
      webSearchFn,
      getFaqsFn: async (limit: number) => {
        const faqs = await getPublicFaqs(limit);
        return faqs.map(f => ({ question: f.question, answer: f.answer || '' }));
      },
      maxSteps,
      maxTokens,
      temperature,
    },
    options,
  );
}
