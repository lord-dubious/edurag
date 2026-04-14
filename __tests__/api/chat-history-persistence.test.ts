import { beforeEach, describe, expect, it, vi } from 'vitest';

type OnFinishEvent = {
  responseMessage: {
    id: string;
    role: 'assistant';
    parts: Array<Record<string, unknown>>;
  };
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<Record<string, unknown>>;
  }>;
  isContinuation: boolean;
  isAborted: boolean;
};

async function loadRoute(onFinishEvent: OnFinishEvent) {
  const appendMessage = vi.fn().mockResolvedValue(undefined);
  const runAgent = vi.fn().mockResolvedValue({
    toUIMessageStreamResponse: async ({ onFinish }: { onFinish?: (event: OnFinishEvent) => Promise<void> | void }) => {
      if (onFinish) {
        await onFinish(onFinishEvent);
      }
      return Response.json({ ok: true });
    },
  });

  vi.doMock('next/headers', () => ({
    headers: async () => new Headers(),
  }));
  vi.doMock('@/lib/auth', () => ({
    auth: {
      api: {
        getSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
      },
    },
  }));
  vi.doMock('@/lib/agent', () => ({ runAgent }));
  vi.doMock('@/lib/faq-manager', () => ({
    trackAndMaybeGenerateFaq: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/title-generator', () => ({
    generateAndSaveTitle: vi.fn().mockResolvedValue(undefined),
  }));
  vi.doMock('@/lib/db/settings', () => ({
    getSettings: vi.fn().mockResolvedValue({
      appName: 'Test University',
      chatConfig: {
        maxSteps: 7,
        maxTokens: 4096,
        temperature: 0.4,
      },
    }),
  }));
  vi.doMock('@/lib/conversation', () => ({
    appendMessage,
    getConversation: vi.fn().mockResolvedValue({ title: 'Existing title' }),
  }));

  const { POST } = await import('@/app/api/chat/route');
  return { POST, appendMessage, runAgent };
}

function buildRequestBody(threadId = 'thread-1') {
  return {
    threadId,
    messages: [
      {
        id: 'user-1-msg',
        role: 'user' as const,
        parts: [{ type: 'text', text: 'What is tuition?' }],
      },
    ],
  };
}

describe('POST /api/chat history persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('persists assistant sources from response tool output', async () => {
    const assistantWithTool = {
      id: 'assistant-1',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Tuition details are available.' },
        {
          type: 'tool-vector_search',
          state: 'output-available',
          output: {
            results: [
              {
                url: 'https://example.edu/tuition',
                title: 'Tuition',
                content: 'Tuition and fee details',
                score: 0.9,
              },
            ],
          },
        },
      ],
    };

    const { POST, appendMessage, runAgent } = await loadRoute({
      responseMessage: assistantWithTool,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'What is tuition?' }],
        },
        assistantWithTool,
      ],
      isContinuation: false,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody()),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
      universityName: 'Test University',
      maxSteps: 7,
      maxTokens: 4096,
      temperature: 0.4,
    }));
    expect(appendMessage).toHaveBeenCalledTimes(2);

    const assistantCall = appendMessage.mock.calls[1];
    expect(assistantCall[0]).toBe('thread-1');
    expect(assistantCall[2]).toBe('user-1');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Tuition details are available.',
      sources: [
        {
          url: 'https://example.edu/tuition',
          title: 'Tuition',
          content: 'Tuition and fee details',
          score: 0.9,
        },
      ],
    });
  });

  it('persists assistant sources from web_search tool output', async () => {
    const assistantWithWebTool = {
      id: 'assistant-web-1',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'I found updated information.' },
        {
          type: 'tool-web_search',
          state: 'output-available',
          output: {
            results: [
              {
                url: 'https://example.edu/news/update',
                title: 'Official Update',
                content: 'Latest official update content',
                score: 0.93,
              },
            ],
          },
        },
      ],
    };

    const { POST, appendMessage } = await loadRoute({
      responseMessage: assistantWithWebTool,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'Any recent updates?' }],
        },
        assistantWithWebTool,
      ],
      isContinuation: false,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody('thread-web-1')),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appendMessage).toHaveBeenCalledTimes(2);

    const assistantCall = appendMessage.mock.calls[1];
    expect(assistantCall[0]).toBe('thread-web-1');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-web-1',
      role: 'assistant',
      content: 'I found updated information.',
      sources: [
        {
          url: 'https://example.edu/news/update',
          title: 'Official Update',
          content: 'Latest official update content',
          score: 0.93,
        },
      ],
    });
  });

  it('persists sources from the latest non-empty search tool output when multiple outputs exist', async () => {
    const assistantWithMultipleSearchOutputs = {
      id: 'assistant-multi-1',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Here are the latest admissions details.' },
        {
          type: 'tool-vector_search',
          state: 'output-available',
          output: {
            results: [
              {
                url: 'https://example.edu/old-admissions',
                title: 'Older Admissions Page',
                content: 'Older admissions content',
                score: 0.75,
              },
            ],
          },
        },
        {
          type: 'tool-web_search',
          state: 'output-available',
          output: {
            results: [
              {
                url: 'https://example.edu/current-admissions',
                title: 'Current Admissions',
                content: 'Current admissions requirements and deadlines',
                score: 0.95,
              },
            ],
          },
        },
      ],
    };

    const { POST, appendMessage } = await loadRoute({
      responseMessage: assistantWithMultipleSearchOutputs,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'What are current admissions requirements?' }],
        },
        assistantWithMultipleSearchOutputs,
      ],
      isContinuation: false,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody('thread-multi-source')),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appendMessage).toHaveBeenCalledTimes(2);

    const assistantCall = appendMessage.mock.calls[1];
    expect(assistantCall[0]).toBe('thread-multi-source');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-multi-1',
      role: 'assistant',
      content: 'Here are the latest admissions details.',
      sources: [
        {
          url: 'https://example.edu/current-admissions',
          title: 'Current Admissions',
          content: 'Current admissions requirements and deadlines',
          score: 0.95,
          sourceType: 'web',
        },
      ],
    });
  });

  it('falls back to prior assistant tool outputs when response message has none', async () => {
    const priorAssistantWithTool = {
      id: 'assistant-mid',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Searching...' },
        {
          type: 'tool-vector_search',
          state: 'output-available',
          output: {
            results: [
              {
                url: 'https://example.edu/admissions',
                title: 'Admissions',
                content: 'Admissions requirements and deadlines',
                score: 0.81,
              },
            ],
          },
        },
      ],
    };

    const responseAssistant = {
      id: 'assistant-final',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Admissions open in September.' },
      ],
    };

    const { POST, appendMessage } = await loadRoute({
      responseMessage: responseAssistant,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'Tell me admissions dates' }],
        },
        priorAssistantWithTool,
        responseAssistant,
      ],
      isContinuation: false,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-2',
        messages: [
          {
            id: 'user-1-msg',
            role: 'user',
            parts: [{ type: 'text', text: 'Tell me admissions dates' }],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appendMessage).toHaveBeenCalledTimes(2);

    const assistantCall = appendMessage.mock.calls[1];
    expect(assistantCall[0]).toBe('thread-2');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-final',
      role: 'assistant',
      content: 'Admissions open in September.',
      sources: [
        {
          url: 'https://example.edu/admissions',
          title: 'Admissions',
          content: 'Admissions requirements and deadlines',
          score: 0.81,
        },
      ],
    });
  });

  it('does not backfill from older assistant messages when immediate previous assistant has no sources', async () => {
    const olderAssistantWithTool = {
      id: 'assistant-older',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Older sourced answer.' },
        {
          type: 'tool-vector_search',
          state: 'output-available',
          output: {
            results: [
              {
                url: 'https://example.edu/older-source',
                title: 'Older Source',
                content: 'Older sourced content',
                score: 0.72,
              },
            ],
          },
        },
      ],
    };

    const immediatePreviousAssistant = {
      id: 'assistant-immediate',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Immediate assistant without tool outputs.' },
      ],
    };

    const responseAssistant = {
      id: 'assistant-final-no-sources',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Final response without tool outputs.' },
      ],
    };

    const { POST, appendMessage } = await loadRoute({
      responseMessage: responseAssistant,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'Tell me something' }],
        },
        olderAssistantWithTool,
        immediatePreviousAssistant,
        responseAssistant,
      ],
      isContinuation: false,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-3',
        messages: [
          {
            id: 'user-1-msg',
            role: 'user',
            parts: [{ type: 'text', text: 'Tell me something' }],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appendMessage).toHaveBeenCalledTimes(2);

    const assistantCall = appendMessage.mock.calls[1];
    expect(assistantCall[0]).toBe('thread-3');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-final-no-sources',
      role: 'assistant',
      content: 'Final response without tool outputs.',
      sources: [],
    });
  });

  it('does not persist assistant message when stream finish is aborted', async () => {
    const responseAssistant = {
      id: 'assistant-aborted',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Partial answer that should not be stored.' },
      ],
    };

    const { POST, appendMessage } = await loadRoute({
      responseMessage: responseAssistant,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'Tell me about tuition' }],
        },
        responseAssistant,
      ],
      isContinuation: false,
      isAborted: true,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody('thread-aborted')),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(appendMessage.mock.calls[0][1]).toMatchObject({
      role: 'user',
      content: 'What is tuition?',
    });
  });

  it('does not persist assistant message for continuation segment finishes', async () => {
    const responseAssistant = {
      id: 'assistant-continuation',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Continuation chunk that should not be stored.' },
      ],
    };

    const { POST, appendMessage } = await loadRoute({
      responseMessage: responseAssistant,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'Tell me about admissions' }],
        },
        responseAssistant,
      ],
      isContinuation: true,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody('thread-continuation')),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(appendMessage.mock.calls[0][1]).toMatchObject({
      role: 'user',
      content: 'What is tuition?',
    });
  });
});
