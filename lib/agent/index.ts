import { runAgent as _runAgent } from '@edurag/agent/text';
import { chatModel } from '../providers';
import { similaritySearchWithScore } from '../vectorstore';
import { getPublicFaqs } from '../faq-manager';
import { env } from '../env';
import type { AgentOptions } from '@edurag/agent/text';

export async function runAgent(options: AgentOptions) {
  return _runAgent(
    {
      model: chatModel,
      searchFn: similaritySearchWithScore,
      getFaqsFn: async (limit: number) => {
        const faqs = await getPublicFaqs(limit);
        return faqs.map(f => ({ question: f.question, answer: f.answer || '' }));
      },
      maxSteps: env.CHAT_MAX_STEPS,
      maxTokens: env.CHAT_MAX_TOKENS,
    },
    options,
  );
}
