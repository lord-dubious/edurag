import { tool } from 'ai';
import { z } from 'zod';
import type { ToolResult } from './types';

export function cleanForDisplay(content: string): string {
    return content
        .replace(/\s+/g, ' ')
        .trim();
}

export type SimilaritySearchFn = (
    query: string,
    topK: number
) => Promise<[{ pageContent: string; metadata: Record<string, unknown> }, number][]>;

export type GetPublicFaqsFn = (limit: number) => Promise<{ question: string; answer: string }[]>;

export interface WebSearchResult {
    content: string;
    url: string;
    title?: string;
    score: number;
}

export type WebSearchFn = (
    query: string,
    maxResults: number
) => Promise<WebSearchResult[]>;

export const createVectorSearchTool = (searchFn: SimilaritySearchFn) =>
    tool({
        description:
            'Search the university knowledge base for information about programs, admissions, fees, campus life, deadlines, and any other university-related topics. IMPORTANT: After receiving results, you MUST provide a text response to the user.',
        inputSchema: z.object({
            query: z.string().describe('A specific search query. Be precise for better results.'),
            topK: z.number().optional().default(6),
        }),
        execute: async ({ query, topK = 6 }): Promise<ToolResult> => {
            const results = await searchFn(query, topK);

            if (results.length === 0) {
                console.log('[vector_search] No results found for query:', query);
                return {
                    found: false,
                    results: [],
                    instruction: 'No local knowledge base results were found. If the web_search tool is available, call it next to find authoritative web sources; otherwise tell the user you could not find specific information and suggest they contact the university directly.'
                };
            }

            console.log('[vector_search] Found', results.length, 'results for query:', query);

            const cleanedResults = results.map(([doc, score]) => {
                const cleaned = cleanForDisplay(doc.pageContent);
                const metadata = doc.metadata ?? {};

                return {
                    content: cleaned.length > 1200 ? cleaned.slice(0, 1200) + '...' : cleaned,
                    url: typeof metadata.url === 'string' ? metadata.url : '',
                    title: typeof metadata.title === 'string' ? metadata.title : undefined,
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

export const createPopularFaqsTool = (getFaqsFn: GetPublicFaqsFn) =>
    tool({
        description: 'Retrieve the most frequently asked questions to suggest related topics.',
        inputSchema: z.object({ limit: z.number().optional().default(3) }),
        execute: async ({ limit }) => {
            const faqs = await getFaqsFn(limit);
            return faqs.map(f => ({ question: f.question, answer: f.answer }));
        },
    });

export const createWebSearchTool = (webSearchFn: WebSearchFn) =>
    tool({
        description:
            'Search trusted web sources when the knowledge base is missing, outdated, or insufficient. Use this as a fallback after vector_search when needed. IMPORTANT: After receiving results, you MUST provide a text response.',
        inputSchema: z.object({
            query: z.string().describe('A focused query for missing or unclear details.'),
            maxResults: z.number().optional().default(5),
        }),
        execute: async ({ query, maxResults = 5 }): Promise<ToolResult> => {
            const results = await webSearchFn(query, maxResults);

            if (results.length === 0) {
                console.log('[web_search] No results found for query:', query);
                return {
                    found: false,
                    results: [],
                    instruction: 'No web results were found. Tell the user what is missing and suggest a direct official contact for confirmation.',
                };
            }

            console.log('[web_search] Found', results.length, 'results for query:', query);

            const cleanedResults = results.map((result) => {
                const cleaned = cleanForDisplay(result.content);
                return {
                    content: cleaned.length > 1200 ? cleaned.slice(0, 1200) + '...' : cleaned,
                    url: result.url,
                    title: result.title,
                    score: Number.isFinite(result.score) ? Math.round(result.score * 100) / 100 : 0,
                };
            });

            console.log('[web_search] Top result:', cleanedResults[0]?.title, 'score:', cleanedResults[0]?.score);

            return {
                found: true,
                results: cleanedResults,
                instruction: 'Above are the fallback web search results. You MUST now write a helpful response to the user based on this information. For citations, you MUST use the format [Clean, Short Title](cite:1) where 1 is the 1-based index of the result, and "Clean, Short Title" is a concise, readable title you create.',
            };
        },
    });
