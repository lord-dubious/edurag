export interface VoiceMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
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

export interface VoiceVectorSearchResult {
    content: string;
    url: string;
    title?: string;
    score: number;
}
