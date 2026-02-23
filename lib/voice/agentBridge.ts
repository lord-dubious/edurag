import type { UIMessage } from 'ai';
import { getHistory, appendMessage } from '@/lib/conversation';
import { runAgent } from '@/lib/agent';
import type { Message } from '@/lib/conversation';
import type { AgentOutput } from './voiceTypes';

async function* runVoiceAgent(
  input: string,
  threadId: string,
  signal?: AbortSignal
): AsyncGenerator<AgentOutput> {
  const history = await getHistory(threadId);

  const userMessage: Message = {
    role: 'user',
    content: input,
    timestamp: new Date(),
  };

  await appendMessage(threadId, userMessage);

  const historyUIMessages: UIMessage[] = history.map((msg, index) => ({
    id: `${threadId}-${index}`,
    role: msg.role,
    parts: [{ type: 'text', text: msg.content }],
  }));

  const userUIMessage: UIMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    parts: [{ type: 'text', text: input }],
  };

  const messages: UIMessage[] = [...historyUIMessages, userUIMessage];

  const result = await runAgent({
    messages,
    threadId,
    voiceMode: true,
    abortSignal: signal,
  });

  let fullText = '';

  for await (const delta of result.textStream) {
    if (signal?.aborted) {
      yield { type: 'agent_done' };
      return;
    }
    if (delta) {
      fullText += delta;
      yield { type: 'agent_chunk', text: delta };
    }
  }

  if (!signal?.aborted && fullText) {
    const assistantMessage: Message = {
      role: 'assistant',
      content: fullText,
      timestamp: new Date(),
    };
    await appendMessage(threadId, assistantMessage);
  }

  yield { type: 'agent_done' };
}

export default runVoiceAgent;
