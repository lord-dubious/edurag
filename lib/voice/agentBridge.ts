import { runAgent } from '@/lib/agent';
import type { UIMessage } from 'ai';

async function runVoiceAgent(
  input: string,
  onTextChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const messages: UIMessage[] = [
    {
      id: crypto.randomUUID(),
      role: 'user',
      parts: [{ type: 'text', text: input }],
    },
  ];

  const result = await runAgent({
    messages,
    threadId: undefined as unknown as string,
    voiceMode: true,
  });

  for await (const textPart of result.textStream) {
    if (signal?.aborted) {
      return;
    }
    onTextChunk(textPart);
  }
}

export default runVoiceAgent;
