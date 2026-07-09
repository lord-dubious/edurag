import { z } from 'zod';
import { type UIMessage, type TextUIPart, type ToolUIPart } from 'ai';
import { runAgent } from '@/lib/agent';
import { trackAndMaybeGenerateFaq } from '@/lib/faq-manager';
import { generateAndSaveTitle } from '@/lib/title-generator';
import { getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { appendMessage, getConversation, saveMessage } from '@/lib/conversation';
import { extractSourcesFromSearchParts } from '@/lib/chat/sources';
import type { Source } from '@edurag/agent/text';

const bodySchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    parts: z.array(z.record(z.string(), z.unknown())),
    content: z.string().optional(),
  })),
  threadId: z.string().optional(),
});

export const maxDuration = 60;

type PartRecord = Record<string, unknown>;
type UIMessagePartLike = PartRecord | TextUIPart | ToolUIPart;
type SearchOutputPart = {
  type: 'tool-vector_search' | 'tool-web_search';
  state: 'output-available';
  output?: {
    results?: unknown;
  };
};

function isTextPart(part: PartRecord): part is { type: 'text'; text: string } {
  return part.type === 'text' && typeof part.text === 'string';
}

function isToolPart(part: PartRecord): part is { type: `tool-${string}`; toolName: string; toolCallId: string; input: unknown; state: string; output?: unknown } {
  return (
    typeof part.type === 'string' &&
    part.type.startsWith('tool-') &&
    typeof part.toolCallId === 'string' &&
    typeof part.state === 'string'
  );
}

function convertToUIMessageParts(parts: PartRecord[]): Array<TextUIPart | ToolUIPart> {
  return parts.flatMap((part): Array<TextUIPart | ToolUIPart> => {
    if (isTextPart(part)) {
      return [{ type: 'text', text: part.text }];
    }
    if (isToolPart(part)) {
      return [part as ToolUIPart];
    }
    return [];
  });
}

function isResponseTextPart(part: UIMessagePartLike): part is TextUIPart {
  return part.type === 'text' && typeof (part as { text?: unknown }).text === 'string';
}

function extractAssistantText(parts: UIMessagePartLike[]): string {
  return parts
    .filter(isResponseTextPart)
    .map(part => part.text)
    .join('');
}

function extractAssistantSources(parts: UIMessagePartLike[]): Source[] {
  return extractSourcesFromSearchParts(parts as SearchOutputPart[]).sources;
}

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, err);
  }

  const session = await auth.api.getSession({ headers: await headers() });
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
    try {
      const existing = await getConversation(currentThreadId, userId);

      await appendMessage(currentThreadId, {
        id: lastMessage.id,
        role: 'user',
        content: userText,
        timestamp: new Date(),
      }, userId);

      if (!existing?.title) {
        generateAndSaveTitle(currentThreadId, userText, userId)
          .catch(err => console.error('[Title] Failed to generate title:', err));
      }
    } catch (dbErr) {
      console.error('[DB] Failed to persist user message or check title:', dbErr);
    }
  }

  try {
    const uiMessages: UIMessage[] = messages.map((m): UIMessage => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      parts: (() => {
        const convertedParts = convertToUIMessageParts(m.parts);
        if (convertedParts.length > 0) {
          return convertedParts;
        }

        const fallbackText = typeof m.content === 'string' ? m.content.trim() : '';
        return fallbackText ? [{ type: 'text', text: fallbackText }] : [];
      })(),
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
    const chatConfig = settings?.chatConfig;
    const universityName = settings?.appName || 'University Knowledge Base';
    const maxSteps = chatConfig?.maxSteps;
    const maxTokens = chatConfig?.maxTokens;
    const temperature = chatConfig?.temperature;

    const streamResult = await runAgent({
      messages: uiMessages,
      threadId: currentThreadId,
      universityName,
      maxSteps,
      maxTokens,
      temperature,
    });
    return streamResult.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      onFinish: async ({ responseMessage, isContinuation }) => {
        if (!userId || responseMessage.role !== 'assistant' || isContinuation) {
          return;
        }

        const assistantText = extractAssistantText(responseMessage.parts as UIMessagePartLike[]).trim();
        if (!assistantText) {
          return;
        }

        const assistantSources = extractAssistantSources(responseMessage.parts as UIMessagePartLike[]);
        const messageId = typeof responseMessage.id === 'string' && responseMessage.id.length > 0
          ? responseMessage.id
          : nanoid();

        try {
          await saveMessage(currentThreadId, {
            id: messageId,
            role: 'assistant',
            content: assistantText,
            timestamp: new Date(),
            sources: assistantSources,
          }, userId);
        } catch (dbErr) {
          console.error('[DB] Failed to persist assistant message:', dbErr);
        }
      },
    });
  } catch (err) {
    console.error('[Chat] agent error:', err);
    const message = err instanceof Error ? err.message : 'Agent failed to process request';
    return errorResponse('AGENT_ERROR', message, 500);
  }
}
