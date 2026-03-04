import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import { AGENT_SYSTEM_PROMPT } from './prompts';
import { createVectorSearchTool, createPopularFaqsTool } from './tools';
import type { SimilaritySearchFn, GetPublicFaqsFn } from './tools';
import type { AgentOptions } from './types';

export interface AgentDependencies {
    model: LanguageModel;
    searchFn: SimilaritySearchFn;
    getFaqsFn: GetPublicFaqsFn;
    maxSteps: number;
    maxTokens: number;
}

export async function runAgent(
    deps: AgentDependencies,
    {
        messages,
        threadId,
        universityName = 'University Knowledge Base',
        extraTools = {},
        maxSteps,
        maxTokens,
        onFinish,
    }: AgentOptions
) {
    const reservedTools = ['vector_search', 'get_popular_faqs'];
    for (const name of Object.keys(extraTools)) {
        if (reservedTools.includes(name)) {
            throw new Error(`[edurag/agent] Tool name '${name}' is reserved. Choose a different name.`);
        }
    }
    const steps = maxSteps ?? deps.maxSteps;
    const tokens = maxTokens ?? deps.maxTokens;
    const system = AGENT_SYSTEM_PROMPT
        .replaceAll('{UNIVERSITY_NAME}', universityName)
        .replace('{CURRENT_DATE}', new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        }));

    console.log('[agent] Running agent with', messages.length, 'messages, maxSteps:', steps);

    return streamText({
        model: deps.model,
        system,
        messages: await convertToModelMessages(messages),
        maxOutputTokens: tokens,
        tools: {
            vector_search: createVectorSearchTool(deps.searchFn),
            get_popular_faqs: createPopularFaqsTool(deps.getFaqsFn),
            ...extraTools,
        },
        stopWhen: stepCountIs(steps),
        experimental_telemetry: {
            isEnabled: !!process.env.LANGCHAIN_TRACING_V2,
            metadata: { threadId },
        },
        onFinish,
    });
}

export { createVectorSearchTool, createPopularFaqsTool, cleanForDisplay } from './tools';
export type { SimilaritySearchFn, GetPublicFaqsFn } from './tools';
export type { AgentOptions, Source, ChatMessage, VectorSearchResult, ToolResult } from './types';
