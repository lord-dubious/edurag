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

/**
 * Extracts the most recent non-empty user message text from a conversation.
 *
 * @param messages - Conversation message list to scan (searched from newest to oldest)
 * @returns The trimmed concatenation of the most recent user's text parts joined with `\n`, or an empty string if no user text is found
 */
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

/**
 * Extracts a list of question strings from a freeform text input.
 *
 * Parses the input to find candidate questions in two ways: substrings ending with '?' and lines formatted as bullets or numbered list items. Deduplicates candidates case-insensitively while preserving the first occurrence's original casing. If no candidates are found, returns the normalized input as a single-item array; if the input is blank after trimming, returns an empty array.
 *
 * @param input - Freeform text that may contain one or more questions (question-mark sentences, bullet lines, or numbered list lines)
 * @returns An array of extracted question strings, deduplicated and whitespace-normalized; empty array when `input` is blank
 */
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

/**
 * Configure and run the streaming AI agent using the provided dependencies and options.
 *
 * Builds a system prompt (including the current date and, when multiple questions are detected
 * in the latest user message, a multi-question instruction), selects tools (including an optional
 * `web_search` tool when provided), adapts the step limit based on detected question count, and
 * invokes `streamText` to produce the streaming response.
 *
 * @param deps - Runtime dependencies required by the agent (model, search functions, etc.).
 * @param messages - Conversation messages to seed the agent's context; the latest user message is scanned to detect questions.
 * @param universityName - Display name to substitute into the system prompt; defaults to "University Knowledge Base".
 * @param extraTools - Additional tool definitions to merge into the agent's toolset.
 * @param maxSteps - Optional override for the maximum reasoning steps; adaptive logic may increase this when multiple questions are detected.
 * @param maxTokens - Optional override for the maximum output token limit.
 * @param temperature - Optional override for the model temperature.
 * @param onFinish - Optional callback forwarded to the streaming runner.
 * @returns The streaming result produced by `streamText`, configured with the constructed system prompt, tools, temperature, token limit, and adaptive stop condition.
 */
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
    const extractedQuestions = extractQuestionList(getLatestUserText(messages));
    const latestQuestionCount = extractedQuestions.length;
    const cappedQuestions = Math.min(latestQuestionCount, 8);
    const latestQuestions = extractedQuestions.slice(0, cappedQuestions);
    const adaptiveSteps = latestQuestionCount > 1
        ? Math.max(steps, Math.min(8, cappedQuestions + 1))
        : steps;
    const multiQuestionInstruction = latestQuestionCount > 1
        ? `\n\n## Multi-Question Coverage\nThe latest user message contains ${cappedQuestions} distinct questions.\nYou MUST answer every question explicitly in your final response.\nUse numbered sections that map one-to-one with these questions:\n${latestQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\nBefore finalizing, verify that no question was skipped.`
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
