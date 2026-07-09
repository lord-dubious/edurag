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
  const saveMessage = vi.fn().mockResolvedValue(undefined);
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
    saveMessage,
    getConversation: vi.fn().mockResolvedValue({ title: 'Existing title' }),
  }));

  const { POST } = await import('@/app/api/chat/route');
  return { POST, appendMessage, saveMessage, runAgent };
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

    const { POST, appendMessage, saveMessage, runAgent } = await loadRoute({
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
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage).toHaveBeenCalledTimes(1);

    const assistantCall = saveMessage.mock.calls[0];
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

    const { POST, appendMessage, saveMessage } = await loadRoute({
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
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage).toHaveBeenCalledTimes(1);

    const assistantCall = saveMessage.mock.calls[0];
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

  it('persists aggregated sources when multiple search tool outputs exist', async () => {
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

    const { POST, appendMessage, saveMessage } = await loadRoute({
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
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage).toHaveBeenCalledTimes(1);

    const assistantCall = saveMessage.mock.calls[0];
    expect(assistantCall[0]).toBe('thread-multi-source');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-multi-1',
      role: 'assistant',
      content: 'Here are the latest admissions details.',
      sources: [
        {
          url: 'https://example.edu/old-admissions',
          title: 'Older Admissions Page',
          content: 'Older admissions content',
          score: 0.75,
          sourceType: 'vector',
        },
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

  it('does not borrow sources from a previous assistant message', async () => {
    const previousAssistantWithTool = {
      id: 'assistant-previous',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Earlier answer with sources.' },
        {
          type: 'tool-vector_search',
          state: 'output-available',
          output: {
            results: [
              {
                url: 'https://example.edu/earlier',
                title: 'Earlier Source',
                content: 'Earlier source content',
                score: 0.91,
              },
            ],
          },
        },
      ],
    };

    const currentAssistantWithoutSources = {
      id: 'assistant-current',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'New answer without any search tool output.' },
      ],
    };

    const { POST, saveMessage } = await loadRoute({
      responseMessage: currentAssistantWithoutSources,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'Tell me something new.' }],
        },
        previousAssistantWithTool,
        {
          id: 'user-2-msg',
          role: 'user',
          parts: [{ type: 'text', text: 'And what about this other thing?' }],
        },
        currentAssistantWithoutSources,
      ],
      isContinuation: false,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-no-borrow',
        messages: [
          {
            id: 'user-2-msg',
            role: 'user' as const,
            parts: [{ type: 'text', text: 'And what about this other thing?' }],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const assistantCall = saveMessage.mock.calls[0];
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-current',
      role: 'assistant',
      content: 'New answer without any search tool output.',
      sources: [],
    });
  });

  it('does not backfill from the prior assistant when the response message has no sources', async () => {
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

    const { POST, appendMessage, saveMessage } = await loadRoute({
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
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage).toHaveBeenCalledTimes(1);

    const assistantCall = saveMessage.mock.calls[0];
    expect(assistantCall[0]).toBe('thread-2');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-final',
      role: 'assistant',
      content: 'Admissions open in September.',
      sources: [],
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

    const { POST, appendMessage, saveMessage } = await loadRoute({
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
    expect(appendMessage).toHaveBeenCalledTimes(1);
    expect(saveMessage).toHaveBeenCalledTimes(1);

    const assistantCall = saveMessage.mock.calls[0];
    expect(assistantCall[0]).toBe('thread-3');
    expect(assistantCall[1]).toMatchObject({
      id: 'assistant-final-no-sources',
      role: 'assistant',
      content: 'Final response without tool outputs.',
      sources: [],
    });
  });

  it('persists the latest partial assistant message when stream finish is aborted', async () => {
    const responseAssistant = {
      id: 'assistant-aborted',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Partial answer that should not be stored.' },
      ],
    };

    const { POST, appendMessage, saveMessage } = await loadRoute({
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
    expect(saveMessage).toHaveBeenCalledTimes(1);
    expect(appendMessage.mock.calls[0][1]).toMatchObject({
      role: 'user',
      content: 'What is tuition?',
    });
    expect(saveMessage.mock.calls[0][1]).toMatchObject({
      id: 'assistant-aborted',
      role: 'assistant',
      content: 'Partial answer that should not be stored.',
      sources: [],
    });
  });

  it('drops unknown message parts instead of stringifying them into prompt text', async () => {
    const responseAssistant = {
      id: 'assistant-sanitized',
      role: 'assistant' as const,
      parts: [
        { type: 'text', text: 'Here is a clean answer.' },
      ],
    };

    const { POST, runAgent } = await loadRoute({
      responseMessage: responseAssistant,
      messages: [
        {
          id: 'user-1-msg',
          role: 'user',
          parts: [
            { type: 'text', text: 'Tell me about tuition' },
            { type: 'metadata', nested: { noisy: true } },
          ],
        },
        responseAssistant,
      ],
      isContinuation: false,
      isAborted: false,
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        threadId: 'thread-sanitized',
        messages: [
          {
            id: 'user-1-msg',
            role: 'user',
            content: 'Tell me about tuition',
            parts: [
              { type: 'text', text: 'Tell me about tuition' },
              { type: 'metadata', nested: { noisy: true } },
            ],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(runAgent).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({
          id: 'user-1-msg',
          parts: [
            { type: 'text', text: 'Tell me about tuition' },
          ],
        }),
      ],
    }));
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
