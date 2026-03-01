import { createVectorSearchTool as _createVectorSearchTool, createPopularFaqsTool as _createPopularFaqsTool } from '@edurag/agent/text/tools';
import { similaritySearchWithScore } from '../vectorstore';
import { getPublicFaqs } from '../faq-manager';

export { cleanForDisplay } from '@edurag/agent/text/tools';

export const createVectorSearchTool = () => _createVectorSearchTool(similaritySearchWithScore);

export const getPopularFaqsTool = _createPopularFaqsTool(
  async (limit: number) => {
    const faqs = await getPublicFaqs(limit);
    return faqs.map(f => ({ question: f.question, answer: f.answer || '' }));
  }
);
