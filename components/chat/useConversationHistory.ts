'use client';

import { useCallback, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { UIMessage } from 'ai';
import type { Source } from '@edurag/agent/text';

interface PersistHistoryPayload {
  role: 'user' | 'assistant';
  id?: string;
  content: string;
  sources?: Source[];
}

interface StoredHistoryMessage {
  role: string;
  content: string;
  timestamp: string;
  id?: string;
  sources?: Source[];
}

interface HistoryResponse {
  messages?: StoredHistoryMessage[];
}

interface UseConversationHistoryOptions {
  threadId: string;
  setThreadId: React.Dispatch<React.SetStateAction<string>>;
  setHistoryRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  setSources: React.Dispatch<React.SetStateAction<Record<string, Source[]>>>;
  onCompactNavigate?: () => void;
}

export function useConversationHistory({
  threadId,
  setThreadId,
  setHistoryRefreshKey,
  setMessages,
  setSources,
  onCompactNavigate,
}: UseConversationHistoryOptions) {
  const historyLoadIdRef = useRef(0);

  const persistHistoryMessage = useCallback(async (
    payload: PersistHistoryPayload,
    context: string,
  ) => {
    try {
      const res = await fetch(`/api/history/${threadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[History] ${context} failed`, {
          status: res.status,
          body,
        });
      }
    } catch (err) {
      console.error(`[History] ${context} failed`, err);
    }
  }, [threadId]);

  const handleHistorySelect = useCallback(async (newThreadId: string) => {
    if (newThreadId === threadId) return;

    const loadId = ++historyLoadIdRef.current;
    setThreadId(newThreadId);
    setMessages([]);
    setSources({});

    try {
      const res = await fetch(`/api/history/${newThreadId}`);
      if (!res.ok) {
        return;
      }

      const data = await res.json() as HistoryResponse;
      if (!data?.messages) {
        return;
      }

      const sourcesMap: Record<string, Source[]> = {};
      const uiMessages: UIMessage[] = data.messages.map((message) => {
        const id = message.id ?? nanoid();
        if (message.role === 'assistant' && Array.isArray(message.sources) && message.sources.length > 0) {
          sourcesMap[id] = message.sources;
        }

        return {
          id,
          role: message.role as 'user' | 'assistant',
          parts: [{ type: 'text', text: message.content }],
          metadata: undefined,
          createdAt: new Date(message.timestamp),
        };
      });

      if (historyLoadIdRef.current === loadId) {
        setMessages(uiMessages);
        setSources(sourcesMap);
      }
    } catch (error) {
      console.error('Failed to load history', error);
    }

    if (window.innerWidth < 768) {
      onCompactNavigate?.();
    }
  }, [onCompactNavigate, setMessages, setSources, setThreadId, threadId]);

  const handleNewChat = useCallback(() => {
    setThreadId(nanoid());
    setMessages([]);
    setSources({});
    setHistoryRefreshKey((value) => value + 1);

    if (window.innerWidth < 768) {
      onCompactNavigate?.();
    }
  }, [onCompactNavigate, setHistoryRefreshKey, setMessages, setSources, setThreadId]);

  const handleDeleteConversation = useCallback(async (deleteThreadId: string) => {
    try {
      const res = await fetch(`/api/history/${deleteThreadId}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error('API delete failed');
      }
    } catch (error) {
      console.error('Failed to delete conversation', error);
      throw error;
    }

    setHistoryRefreshKey((value) => value + 1);
    if (deleteThreadId === threadId) {
      handleNewChat();
    }
  }, [handleNewChat, setHistoryRefreshKey, threadId]);

  return {
    persistHistoryMessage,
    handleHistorySelect,
    handleNewChat,
    handleDeleteConversation,
  };
}
