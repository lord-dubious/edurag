import { runAgent as _runAgent } from '@edurag/agent/text';
import { createOpenAI } from '@ai-sdk/openai';
import { chatModel } from '../providers';
import { similaritySearchWithScore } from '../vectorstore';
import { getPublicFaqs } from '../faq-manager';
import { env } from '../env';
import { getSettings } from '../db/settings';
import type { AgentOptions } from '@edurag/agent/text';

export async function runAgent(options: AgentOptions) {
  const settings = await getSettings();
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
