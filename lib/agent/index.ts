import { runAgent as _runAgent } from '@edurag/agent/text';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { chatModel } from '../providers';
import { similaritySearchWithScore } from '../vectorstore';
import { getPublicFaqs } from '../faq-manager';
import { env } from '../env';
import { getSettings } from '../db/settings';
import type { AgentOptions } from '@edurag/agent/text';

function normalizeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  return value.length > 0 ? value : undefined;
}

function buildChatModel(config: { model: string; baseUrl?: string; apiKey?: string }): LanguageModel {
  return createOpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeUrl(config.baseUrl),
  }).chat(config.model);
}

function resolvePrimaryChatModel(settings: Awaited<ReturnType<typeof getSettings>>): LanguageModel {
  const chatConfig = settings?.chatConfig;
  const modelName = chatConfig?.model || env.CHAT_MODEL;
  const baseURL = chatConfig?.baseUrl || env.CHAT_BASE_URL;
  const apiKey = chatConfig?.apiKey || env.CHAT_API_KEY;
  const hasOverrides = Boolean(chatConfig?.model || chatConfig?.baseUrl || chatConfig?.apiKey);

  if (!hasOverrides) {
    return chatModel;
  }

  return buildChatModel({
    model: modelName,
    baseUrl: baseURL,
    apiKey,
  });
}

export function resolveFallbackChatModel(): LanguageModel | null {
  if (!env.CHAT_FALLBACK_MODEL) {
    return null;
  }

  const baseUrl = env.CHAT_FALLBACK_BASE_URL || env.CHAT_BASE_URL;
  const apiKey = env.CHAT_FALLBACK_API_KEY || env.CHAT_API_KEY;

  if (!apiKey) {
    return null;
  }

  return buildChatModel({
    model: env.CHAT_FALLBACK_MODEL,
    baseUrl,
    apiKey,
  });
}

export async function runAgent(options: AgentOptions, overrides?: { model?: LanguageModel }) {
  const settings = await getSettings();
  const chatConfig = settings?.chatConfig;
  const model = overrides?.model ?? resolvePrimaryChatModel(settings);
  const maxSteps = options.maxSteps ?? chatConfig?.maxSteps ?? env.CHAT_MAX_STEPS;
  const maxTokens = options.maxTokens ?? chatConfig?.maxTokens ?? env.CHAT_MAX_TOKENS;

  return _runAgent(
    {
      model,
      searchFn: similaritySearchWithScore,
      getFaqsFn: async (limit: number) => {
        const faqs = await getPublicFaqs(limit);
        return faqs.map(f => ({ question: f.question, answer: f.answer || '' }));
      },
      maxSteps,
      maxTokens,
    },
    options,
  );
}
