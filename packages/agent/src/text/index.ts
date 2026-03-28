import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import type { LanguageModel } from 'ai';
import { AGENT_SYSTEM_PROMPT } from './prompts';
import { createVectorSearchTool, createPopularFaqsTool, createWebSearchTool } from './tools';
import type { SimilaritySearchFn, GetPublicFaqsFn, WebSearchFn } from './tools';
import type { AgentOptions } from './types';

export interface AgentDependencies {
    model: LanguageModel;
    searchFn: SimilaritySearchFn;
    getFaqsFn: GetPublicFaqsFn;
    webSearchFn?: WebSearchFn;
    maxSteps: number;
    maxTokens: number;
    temperature: number;
}

function getLatestUserText(messages: AgentOptions['messages']): string {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        const message = messages[i];
        if (message.role !== 'user') {
            continue;
        }

        const textParts = message.parts
            .filter((part): part is { type: 'text'; text: string } => (
                part.type === 'text' && typeof (part as { text?: unknown }).text === 'string'
            ))
            .map(part => part.text.trim())
            .filter(Boolean);

        if (textParts.length > 0) {
            return textParts.join('\n');
        }
    }

    return '';
}

function extractQuestionList(input: string): string[] {
    if (!input.trim()) {
        return [];
    }

    const fromQuestionMarks = (input.match(/[^?]+\?/g) ?? [])
        .map(q => q.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const fromBullets = input
        .split('\n')
        .map(line => line.trim())
        .filter(line => /^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line))
        .map(line => line.replace(/^[-*]\s+/, '').replace(/^\d+[.)]\s+/, '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    const merged = [...fromQuestionMarks, ...fromBullets];
    const deduped = Array.from(new Set(merged.map(item => item.toLowerCase())))
        .map((lower) => merged.find(item => item.toLowerCase() === lower) ?? lower);

    if (deduped.length > 0) {
        return deduped;
    }

    return [input.replace(/\s+/g, ' ').trim()];
}

export async function runAgent(
    deps: AgentDependencies,
    {
        messages,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        threadId: _threadId,
        universityName = 'University Knowledge Base',
        extraTools = {},
        maxSteps,
        maxTokens,
        temperature,
        onFinish,
    }: AgentOptions
) {
    // threadId reserved for future per-thread context (e.g., scoped search filters)
    const steps = maxSteps ?? deps.maxSteps;
    const tokens = maxTokens ?? deps.maxTokens;
    const temp = temperature ?? deps.temperature;
    const latestQuestions = extractQuestionList(getLatestUserText(messages)).slice(0, 8);
    const adaptiveSteps = latestQuestions.length > 1
        ? Math.max(steps, Math.min(8, latestQuestions.length + 1))
        : steps;
    const multiQuestionInstruction = latestQuestions.length > 1
        ? `\n\n## Multi-Question Coverage\nThe latest user message contains ${latestQuestions.length} distinct questions.\nYou MUST answer every question explicitly in your final response.\nUse numbered sections that map one-to-one with these questions:\n${latestQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\nBefore finalizing, verify that no question was skipped.`
        : '';
    const system = AGENT_SYSTEM_PROMPT
        .replaceAll('{UNIVERSITY_NAME}', universityName)
        .replace('{CURRENT_DATE}', new Date().toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
        })) + multiQuestionInstruction;

    console.log('[agent] Running agent with', messages.length, 'messages, maxSteps:', adaptiveSteps);

    return streamText({
        model: deps.model,
        system,
        messages: await convertToModelMessages(messages),
        temperature: temp,
        maxOutputTokens: tokens,
        tools: {
            vector_search: createVectorSearchTool(deps.searchFn),
            get_popular_faqs: createPopularFaqsTool(deps.getFaqsFn),
            ...(deps.webSearchFn ? { web_search: createWebSearchTool(deps.webSearchFn) } : {}),
            ...extraTools,
        },
        stopWhen: stepCountIs(adaptiveSteps),
        experimental_telemetry: { isEnabled: false },
        onFinish,
    });
}

export { createVectorSearchTool, createPopularFaqsTool, createWebSearchTool, cleanForDisplay } from './tools';
export type { SimilaritySearchFn, GetPublicFaqsFn, WebSearchFn, WebSearchResult } from './tools';
export type { AgentOptions, Source, ChatMessage, VectorSearchResult, ToolResult } from './types';
