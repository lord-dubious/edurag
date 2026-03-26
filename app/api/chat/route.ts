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
import { appendMessage, getConversation } from '@/lib/conversation';
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
type VectorSearchOutputPart = {
  type: 'tool-vector_search';
  state: 'output-available';
  output?: {
    results?: unknown;
  };
};

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

function isResponseTextPart(part: UIMessagePartLike): part is TextUIPart {
  return part.type === 'text' && typeof (part as { text?: unknown }).text === 'string';
}

function isVectorSearchOutputPart(part: UIMessagePartLike): part is VectorSearchOutputPart {
  return part.type === 'tool-vector_search' && (part as { state?: unknown }).state === 'output-available';
}

function extractAssistantText(parts: UIMessagePartLike[]): string {
  return parts
    .filter(isResponseTextPart)
    .map(part => part.text)
    .join('');
}

function extractAssistantSources(parts: UIMessagePartLike[]): Source[] {
  const sources: Source[] = [];

  parts.forEach((part) => {
    if (!isVectorSearchOutputPart(part)) {
      return;
    }

    const results = part.output?.results;
    if (!Array.isArray(results)) {
      return;
    }

    results.forEach((result) => {
      if (typeof result !== 'object' || result === null) {
        return;
      }

      const candidate = result as Record<string, unknown>;
      const content = typeof candidate.content === 'string' ? candidate.content.trim() : '';
      if (!content) {
        return;
      }

      const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
      const title = typeof candidate.title === 'string' && candidate.title.trim().length > 0
        ? candidate.title.trim()
        : undefined;
      const score = typeof candidate.score === 'number' && Number.isFinite(candidate.score)
        ? candidate.score
        : undefined;

      sources.push({
        url,
        title,
        content,
        score,
      });
    });
  });

  return sources;
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

      // Trigger title generation only when the conversation has no title yet
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
    });

    const streamResult = await result;
    return streamResult.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      onFinish: async ({ responseMessage, messages }) => {
        if (!userId || responseMessage.role !== 'assistant') {
          return;
        }

        const assistantText = extractAssistantText(responseMessage.parts as UIMessagePartLike[]).trim();
        if (!assistantText) {
          return;
        }

        let assistantSources = extractAssistantSources(responseMessage.parts as UIMessagePartLike[]);
        if (assistantSources.length === 0) {
          for (let i = messages.length - 1; i >= 0; i -= 1) {
            const candidate = messages[i];
            if (candidate.role !== 'assistant') {
              continue;
            }
            const candidateSources = extractAssistantSources(candidate.parts as UIMessagePartLike[]);
            if (candidateSources.length > 0) {
              assistantSources = candidateSources;
              break;
            }
          }
        }
        const messageId = typeof responseMessage.id === 'string' && responseMessage.id.length > 0
          ? responseMessage.id
          : nanoid();

        try {
          await appendMessage(currentThreadId, {
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
