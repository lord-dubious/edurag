import { z } from 'zod';
import { type UIMessage } from 'ai';
import { runAgent } from '@/lib/agent';
import { getHistory, appendMessage } from '@/lib/conversation';
import { trackAndMaybeGenerateFaq } from '@/lib/faq-manager';
import { errorResponse } from '@/lib/errors';
import { nanoid } from 'nanoid';

const bodySchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(z.any()),
    content: z.string().optional(),
  })),
  threadId: z.string().min(1),
});

export const maxDuration = 60;

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, err);
  }

  const { messages, threadId } = body;
  const lastMessage = messages.at(-1);

  if (!lastMessage || lastMessage.role !== 'user') {
    return errorResponse('VALIDATION_ERROR', 'Last message must be from user', 400);
  }

  const userText = lastMessage.parts
    .filter(p => p.type === 'text')
    .map(p => (p as any).text)
    .join('') || lastMessage.content || '';

  trackAndMaybeGenerateFaq(userText).catch(err =>
    console.error('[FAQ] tracking failed:', err),
  );

  try {
    const history = await getHistory(threadId);

    const uiMessages: UIMessage[] = [
      ...history.map(m => ({
        id: nanoid(),
        role: m.role as 'user' | 'assistant',
        parts: [{ type: 'text' as const, text: m.content }],
      })),
      ...messages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        parts: m.parts,
      })),
    ];

    const result = runAgent({
      messages: uiMessages,
      threadId,
    });

    result.then(async (fullResult) => {
      try {
        const text = await fullResult.text;
        await appendMessage(threadId, { role: 'user', content: userText, timestamp: new Date() });
        await appendMessage(threadId, { role: 'assistant', content: text, timestamp: new Date() });
      } catch (err) {
        console.error('[Chat] persistence failed:', err);
      }
    }).catch(err => console.error('[Chat] agent error:', err));

    return (await result).toUIMessageStreamResponse();
  } catch (err) {
    console.error('[Chat] agent error:', err);
    return errorResponse('AGENT_ERROR', 'Agent failed to process request', 500);
  }
}
