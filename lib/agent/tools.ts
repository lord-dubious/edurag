import { tool } from 'ai';
import { z } from 'zod';
import { similaritySearchWithScore } from '../vectorstore';
import type { ToolResult } from './types';

function cleanForDisplay(content: string): string {
  return content
    .replace(/\s+/g, ' ')
    .trim();
}

export const createVectorSearchTool = (threadId?: string) =>
  tool({
    description:
      'Search the university knowledge base for information about programs, admissions, fees, campus life, deadlines, and any other university-related topics. IMPORTANT: After receiving results, you MUST provide a text response to the user.',
    inputSchema: z.object({
      query: z.string().describe('A specific search query. Be precise for better results.'),
      topK: z.number().optional().default(6),
    }),
    execute: async ({ query, topK = 6 }): Promise<ToolResult> => {
      const results = await similaritySearchWithScore(query, threadId, topK);

      if (results.length === 0) {
        console.log('[vector_search] No results found for query:', query);
        return {
          found: false,
          results: [],
          instruction: 'No results found. Tell the user you could not find specific information and suggest they contact the university directly.'
        };
      }

      console.log('[vector_search] Found', results.length, 'results for query:', query);

      const cleanedResults = results.map(([doc, score]) => {
        const cleaned = cleanForDisplay(doc.pageContent);
        return {
          content: cleaned.length > 1200 ? cleaned.slice(0, 1200) + '...' : cleaned,
          url: doc.metadata.url as string,
          title: doc.metadata.title as string | undefined,
          score: Math.round(score * 100) / 100,
        };
      });

      console.log('[vector_search] Top result:', cleanedResults[0]?.title, 'score:', cleanedResults[0]?.score);

      return {
        found: true,
        results: cleanedResults,
        instruction: 'Above are the search results. You MUST now write a helpful response to the user based on this information. For citations, you MUST use the format [Clean, Short Title](cite:1) where 1 is the 1-based index of the result, and "Clean, Short Title" is a highly readable, concise name (2-4 words) you create that elegantly describes the source instead of its raw title.',
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
