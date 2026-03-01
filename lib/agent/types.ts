import type { UIMessage } from 'ai';

export interface AgentOptions {
  messages: UIMessage[];
  threadId: string;
  universityName?: string;
  extraTools?: Record<string, unknown>;
  maxSteps?: number;
  maxTokens?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFinish?: (result: any) => Promise<void> | void;
}

export interface Source {
  url: string;
  title?: string;
  content: string;
  score?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface VectorSearchResult {
  content: string;
  url: string;
  title?: string;
  score: number;
}

export interface ToolResult {
  found: boolean;
  results: VectorSearchResult[];
  instruction?: string;
}
