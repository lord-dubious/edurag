import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

describe('lib/agent web fallback context', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('uses institution context and configured domains in Tavily fallback searches', async () => {
    const coreRunAgent = vi.fn().mockResolvedValue({ ok: true });
    const tavilySearch = vi.fn().mockResolvedValue({
      results: [
        {
          url: 'https://www.example.edu/admissions',
          title: 'Admissions Deadlines',
          content: 'Admissions close on January 15.',
          score: 0.94,
        },
      ],
    });

    vi.doMock('@edurag/agent/text', () => ({
      runAgent: coreRunAgent,
    }));
    vi.doMock('@tavily/core', () => ({
      tavily: vi.fn(() => ({ search: tavilySearch })),
    }));
    vi.doMock('@/lib/providers', () => ({
      chatModel: { provider: 'mock-chat-model' },
    }));
    vi.doMock('@/lib/vectorstore', () => ({
      similaritySearchWithScore: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/faq-manager', () => ({
      getPublicFaqs: vi.fn().mockResolvedValue([]),
    }));
    vi.doMock('@/lib/env', () => ({
      env: {
        CHAT_MODEL: 'gpt-oss-120b',
        CHAT_BASE_URL: '',
        CHAT_API_KEY: 'chat-key',
        CHAT_MAX_STEPS: 5,
        CHAT_MAX_TOKENS: 32000,
        CHAT_TEMPERATURE: 0.2,
        TAVILY_API_KEY: '',
      },
    }));
    vi.doMock('@/lib/db/settings', () => ({
      getSettings: vi.fn().mockResolvedValue({
        appName: 'Example University',
        uniUrl: 'https://www.example.edu',
        externalUrls: ['https://trusted.partner.edu/path'],
        tavilyApiKey: 'tvly-test-key',
      }),
    }));

    const { runAgent } = await import('@/lib/agent');

    const messages: UIMessage[] = [
      {
        id: 'u1',
        role: 'user',
        parts: [{ type: 'text', text: 'What is the admissions deadline?' }],
      },
    ];

    await runAgent({
      messages,
      threadId: 'thread-ctx',
      universityName: 'Example University',
    });

    const deps = coreRunAgent.mock.calls[0][0] as {
      webSearchFn?: (query: string, maxResults: number) => Promise<unknown>;
    };

    expect(typeof deps.webSearchFn).toBe('function');

    await deps.webSearchFn?.('admissions deadline', 5);
    expect(tavilySearch).toHaveBeenCalledWith(
      'admissions deadline Example University',
      expect.objectContaining({
        includeDomains: expect.arrayContaining(['example.edu', 'trusted.partner.edu']),
      }),
    );

    await deps.webSearchFn?.('Example University tuition', 5);
    expect(tavilySearch).toHaveBeenLastCalledWith(
      'Example University tuition',
      expect.objectContaining({
        includeDomains: expect.arrayContaining(['example.edu', 'trusted.partner.edu']),
      }),
    );
  });
});
