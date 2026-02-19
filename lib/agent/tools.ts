import { tool } from 'ai';
import { z } from 'zod';
import { similaritySearchWithScore } from '../vectorstore';
import type { VectorSearchResult, ToolResult } from './types';

export const createVectorSearchTool = () =>
  tool({
    description:
      'Search the university knowledge base for information about programs, admissions, fees, campus life, deadlines, and any other university-related topics.',
    inputSchema: z.object({
      query: z.string().describe('A specific search query. Be precise for better results.'),
      topK: z.number().optional().default(5),
    }),
    execute: async ({ query, topK = 5 }): Promise<ToolResult> => {
      const results = await similaritySearchWithScore(query, undefined, topK);

      if (results.length === 0) return { found: false, results: [] };

      return {
        found: true,
        results: results.map(([doc, score]) => ({
          content: doc.pageContent,
          url: doc.metadata.url as string,
          title: doc.metadata.title as string | undefined,
          score: Math.round(score * 100) / 100,
        })),
      };
    },
  });

export const getPopularFaqsTool = tool({
  description: 'Retrieve the most frequently asked questions to suggest related topics.',
  inputSchema: z.object({ limit: z.number().optional().default(3) }),
  execute: async ({ limit }) => {
    const { getPublicFaqs } = await import('../faq-manager');
    const faqs = await getPublicFaqs(limit);
    return faqs.map(f => ({ question: f.question, answer: f.answer }));
  },
});
