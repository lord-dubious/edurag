import type { Source, VectorSearchResult } from '../text/types';

export interface VoiceMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    sources?: Source[];
}

export interface VoiceConversation {
    id: string;
    messages: VoiceMessage[];
    startedAt: number;
    endedAt?: number;
}

export interface VectorSearchFunctionArgs {
    query: string;
    topK?: number;
}

export type VoiceVectorSearchResult = VectorSearchResult;
