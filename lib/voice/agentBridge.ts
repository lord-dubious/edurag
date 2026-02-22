import { runAgent } from '@/lib/agent';
import type { UIMessage } from 'ai';

interface AgentChunk {
  type: 'agent_chunk';
  text: string;
}

interface AgentDone {
  type: 'agent_done';
}

type AgentOutput = AgentChunk | AgentDone;

async function* runVoiceAgent(
  input: string,
  threadId: string,
  signal?: AbortSignal
): AsyncGenerator<AgentOutput> {
  const messages: UIMessage[] = [
    {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: input }],
    },
  ];

  const result = await runAgent({
    messages,
    threadId,
    voiceMode: true,
  });

  for await (const delta of result.textStream) {
    if (signal?.aborted) {
      yield { type: 'agent_done' };
      return;
    }
    if (delta) {
      yield { type: 'agent_chunk', text: delta };
    }
  }

  yield { type: 'agent_done' };
}

export default runVoiceAgent;
