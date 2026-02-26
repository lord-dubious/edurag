import { z } from 'zod';
import { type UIMessage, type TextUIPart, type ToolUIPart } from 'ai';
import { runAgent } from '@/lib/agent';
import { trackAndMaybeGenerateFaq } from '@/lib/faq-manager';
import { getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';
import { nanoid } from 'nanoid';
import { auth } from '@/auth';
import { appendMessage } from '@/lib/conversation';

const bodySchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(z.record(z.string(), z.unknown())),
    content: z.string().optional(),
  })),
  threadId: z.string().optional(),
});

export const maxDuration = 60;

type PartRecord = Record<string, unknown>;

function isTextPart(part: PartRecord): part is { type: 'text'; text: string } {
  return part.type === 'text' && typeof part.text === 'string';
}

function isToolPart(part: PartRecord): part is { type: `tool-${string}`; toolName: string; toolCallId: string; input: unknown; state: string; output?: unknown } {
  return typeof part.type === 'string' && part.type.startsWith('tool-');
}

function convertToUIMessageParts(parts: PartRecord[]): Array<TextUIPart | ToolUIPart> {
  return parts.map((part): TextUIPart | ToolUIPart => {
    if (isTextPart(part)) {
      return { type: 'text', text: part.text };
    }
    if (isToolPart(part)) {
      return part as ToolUIPart;
    }
    return { type: 'text', text: JSON.stringify(part) };
  });
}

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, err);
  }

  const session = await auth();
  const userId = session?.user?.id;

  const { messages, threadId } = body;
  const currentThreadId = threadId ?? nanoid();
  const lastMessage = messages.at(-1);

  if (!lastMessage || lastMessage.role !== 'user') {
    return errorResponse('VALIDATION_ERROR', 'Last message must be from user', 400);
  }

  const userText = lastMessage.parts
    .filter(isTextPart)
    .map(p => p.text)
    .join('') || lastMessage.content || '';

  trackAndMaybeGenerateFaq(userText).catch(err =>
    console.error('[FAQ] tracking failed:', err),
  );

  if (userId) {
    await appendMessage(currentThreadId, {
      role: 'user',
      content: userText,
      timestamp: new Date(),
    }, userId);
  }

  try {
    const uiMessages: UIMessage[] = messages.map((m): UIMessage => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: convertToUIMessageParts(m.parts),
    }));

    const lastAssistantIdx = uiMessages.findLastIndex(m => m.role === 'assistant');
    for (let i = 0; i < uiMessages.length; i++) {
      if (i !== lastAssistantIdx && uiMessages[i].role === 'assistant') {
        uiMessages[i] = {
          ...uiMessages[i],
          parts: uiMessages[i].parts.filter(p => p.type === 'text'),
        };
      }
    }

    const settings = await getSettings();
    const universityName = settings?.appName || 'University Knowledge Base';
    const maxSteps = settings?.chatConfig?.maxSteps;
    const maxTokens = settings?.chatConfig?.maxTokens;

    const result = runAgent({
      messages: uiMessages,
      threadId: currentThreadId,
      universityName,
      maxSteps,
      maxTokens,
      onFinish: async ({ text }) => {
        if (userId && text) {
          await appendMessage(currentThreadId, {
            role: 'assistant',
            content: text,
            timestamp: new Date(),
          }, userId);
        }
      }
    });

    return (await result).toUIMessageStreamResponse();
  } catch (err) {
    console.error('[Chat] agent error:', err);
    const message = err instanceof Error ? err.message : 'Agent failed to process request';
    return errorResponse('AGENT_ERROR', message, 500);
  }
}
