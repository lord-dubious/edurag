import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';
import type { AgentDependencies } from '@edurag/agent/text';

const streamTextMock = vi.fn();
const convertToModelMessagesMock = vi.fn();
const stepCountIsMock = vi.fn();

vi.mock('ai', () => ({
  streamText: streamTextMock,
  convertToModelMessages: convertToModelMessagesMock,
  stepCountIs: stepCountIsMock,
  tool: (definition: unknown) => definition,
}));

describe('text agent runtime config', () => {
  const messages: UIMessage[] = [
    {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  ];

  const deps: AgentDependencies = {
    model: {} as AgentDependencies['model'],
    searchFn: async () => [],
    getFaqsFn: async () => [],
    maxSteps: 5,
    maxTokens: 32000,
    temperature: 0.2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    convertToModelMessagesMock.mockResolvedValue([]);
    stepCountIsMock.mockImplementation((value: number) => `steps-${value}`);
    streamTextMock.mockReturnValue({ ok: true });
  });

  it('uses dependency defaults when options are not provided', async () => {
    const { runAgent } = await import('@edurag/agent/text');

    await runAgent(deps, {
      messages,
      threadId: 'thread-defaults',
    });

    expect(stepCountIsMock).toHaveBeenCalledWith(5);
    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      temperature: 0.2,
      maxOutputTokens: 32000,
      stopWhen: 'steps-5',
    }));
  });

  it('prefers per-request overrides for maxSteps, maxTokens, and temperature', async () => {
    const { runAgent } = await import('@edurag/agent/text');

    await runAgent(deps, {
      messages,
      threadId: 'thread-overrides',
      maxSteps: 3,
      maxTokens: 2048,
      temperature: 0.9,
    });

    expect(stepCountIsMock).toHaveBeenCalledWith(3);
    expect(streamTextMock).toHaveBeenCalledWith(expect.objectContaining({
      temperature: 0.9,
      maxOutputTokens: 2048,
      stopWhen: 'steps-3',
    }));
  });

  it('enables web_search tool when webSearchFn is provided', async () => {
    const { runAgent } = await import('@edurag/agent/text');

    await runAgent(
      {
        ...deps,
        webSearchFn: async () => [],
      },
      {
        messages,
        threadId: 'thread-web-tool',
      },
    );

    const streamArgs = streamTextMock.mock.calls[0][0] as { tools: Record<string, unknown> };
    expect(streamArgs.tools).toHaveProperty('web_search');
    expect(streamArgs.tools).toHaveProperty('vector_search');
  });

  it('increases step budget for multi-question prompts and injects coverage instruction', async () => {
    const { runAgent } = await import('@edurag/agent/text');

    await runAgent(
      {
        ...deps,
        maxSteps: 2,
      },
      {
        messages: [
          {
            id: 'msg-multi',
            role: 'user',
            parts: [{ type: 'text', text: 'What is tuition? What is the admissions deadline? What scholarships are available?' }],
          },
        ],
        threadId: 'thread-multi',
      },
    );

    const streamArgs = streamTextMock.mock.calls[0][0] as { system: string; stopWhen: string };
    expect(stepCountIsMock).toHaveBeenCalledWith(4);
    expect(streamArgs.stopWhen).toBe('steps-4');
    expect(streamArgs.system).toContain('## Multi-Question Coverage');
  });
});
