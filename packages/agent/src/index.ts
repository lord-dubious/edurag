export { runAgent } from './text';
export type { AgentOptions, AgentDependencies } from './text';
export type { Source, VectorSearchResult, ToolResult, ChatMessage } from './text/types';
export { AGENT_SYSTEM_PROMPT, FAQ_SYNTHESIS_PROMPT, DEFAULT_CRAWL_INSTRUCTIONS } from './text/prompts';
export { createVectorSearchTool, createPopularFaqsTool, cleanForDisplay } from './text/tools';
export type { SimilaritySearchFn, GetPublicFaqsFn } from './text/tools';

export { stripMarkdownForVoice, getSystemPrompt } from './voice';
export type {
    AgentState,
    VoiceMessage,
} from './voice';

export type {
    VoiceConversation,
    VectorSearchFunctionArgs,
    VoiceVectorSearchResult,
} from './voice/types';
