import { createVectorSearchTool as _createVectorSearchTool, createPopularFaqsTool as _createPopularFaqsTool, cleanForDisplay } from '@edurag/agent/text';
import { similaritySearchWithScore } from '../vectorstore';
import { getPublicFaqs } from '../faq-manager';

export { cleanForDisplay };

export const createVectorSearchTool = () => _createVectorSearchTool(similaritySearchWithScore);

export const getPopularFaqsTool = (): ReturnType<typeof _createPopularFaqsTool> => _createPopularFaqsTool(
  async (limit: number) => {
    const faqs = await getPublicFaqs(limit);
    return faqs.map(f => ({ question: f.question, answer: f.answer || '' }));
  }
);
