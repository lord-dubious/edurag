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
type SearchOutputPart = {
  type: 'tool-vector_search' | 'tool-web_search';
  state: 'output-available';
  output?: {
    results?: unknown;
  };
};

/**
 * Check whether a PartRecord represents a text part with a string payload.
 *
 * @param part - The part to inspect
 * @returns `true` if `part.type` is `'text'` and `part.text` is a string, `false` otherwise.
 */
function isTextPart(part: PartRecord): part is { type: 'text'; text: string } {
  return part.type === 'text' && typeof part.text === 'string';
}

function isToolPart(part: PartRecord): part is { type: `tool-${string}`; toolName: string; toolCallId: string; input: unknown; state: string; output?: unknown } {
  return typeof part.type === 'string' && part.type.startsWith('tool-');
}

/**
 * Convert internal PartRecord entries into UI-friendly message parts.
 *
 * @param parts - Array of internal part records to convert
 * @returns An array where text parts are normalized to `{ type: 'text', text }`, tool parts are preserved as `ToolUIPart`, and unrecognized parts are rendered as text parts containing their JSON representation
 */
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

/**
 * Determine whether a UI message part represents a text part.
 *
 * @param part - The UI message part to test
 * @returns `true` if the part is a `TextUIPart`, `false` otherwise.
 */
function isResponseTextPart(part: UIMessagePartLike): part is TextUIPart {
  return part.type === 'text' && typeof (part as { text?: unknown }).text === 'string';
}

/**
 * Determines whether a UI message part is a search tool output with results available.
 *
 * @param part - The message part to test
 * @returns `true` if `part.type` is `'tool-vector_search'` or `'tool-web_search'` and `part.state` equals `'output-available'`, `false` otherwise
 */
function isSearchOutputPart(part: UIMessagePartLike): part is SearchOutputPart {
  return (
    (part.type === 'tool-vector_search' || part.type === 'tool-web_search') &&
    (part as { state?: unknown }).state === 'output-available'
  );
}

/**
 * Concatenates the text content of all response text parts into a single string.
 *
 * @param parts - Array of UI message parts; only parts recognized as response text parts contribute text
 * @returns The combined text from response text parts in original order, or an empty string if none are present
 */
function extractAssistantText(parts: UIMessagePartLike[]): string {
  return parts
    .filter(isResponseTextPart)
    .map(part => part.text)
    .join('');
}

/**
 * Extracts structured Source entries from assistant message parts that contain completed search tool outputs.
 *
 * Iterates search output parts (web or vector) and returns an array of Source objects for each result that provides non-empty trimmed `content`. Each Source includes `content`, `url` (empty string if missing), optional `title` (omitted when empty), optional finite numeric `score`, and `sourceType` inferred as `'web'` for `tool-web_search` or `'vector'` for `tool-vector_search`.
 *
 * @param parts - Array of UI message parts which may include search tool output parts
 * @returns An array of parsed Source objects derived from available search results; results lacking usable `content` are omitted
 */
function extractAssistantSources(parts: UIMessagePartLike[]): Source[] {
  const sources: Source[] = [];

  parts.forEach((part) => {
    if (!isSearchOutputPart(part)) {
      return;
    }
    const sourceType: Source['sourceType'] = part.type === 'tool-web_search' ? 'web' : 'vector';

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
        sourceType,
      });
    });
  });

  return sources;
}

/**
 * Handle POST /chat requests: validate the payload, run the agent, stream the agent's UI message response, and persist conversation changes.
 *
 * Validates the incoming JSON body, ensures the last message is a user message, and derives the user's text. Starts background tasks (FAQ tracking and optional conversation title generation). Converts incoming messages to UI-ready messages, loads settings, runs the agent, and returns a streamed UI message response. After the stream completes, conditionally persists the assistant's final message and its sources when there is an authenticated user and the run is not aborted or a continuation; if the assistant's sources are empty, attempts to inherit sources from the immediately preceding assistant message.
 *
 * @param req - The incoming HTTP request containing the chat payload
 * @returns An HTTP response that streams the agent's UI message output on success, or an error response with a standardized error code on validation or agent failure
 */
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
    const temperature = settings?.chatConfig?.temperature;

    const result = runAgent({
      messages: uiMessages,
      threadId: currentThreadId,
      universityName,
      maxSteps,
      maxTokens,
      temperature,
    });

    const streamResult = await result;
    return streamResult.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      onFinish: async ({ responseMessage, messages, isAborted, isContinuation }) => {
        if (!userId || responseMessage.role !== 'assistant' || isAborted || isContinuation) {
          return;
        }

        const assistantText = extractAssistantText(responseMessage.parts as UIMessagePartLike[]).trim();
        if (!assistantText) {
          return;
        }

        let assistantSources = extractAssistantSources(responseMessage.parts as UIMessagePartLike[]);
        if (assistantSources.length === 0) {
          const responseIdx = messages.findIndex(message => message.id === responseMessage.id);
          if (responseIdx > 0) {
            const previousMessage = messages[responseIdx - 1];
            if (previousMessage.role === 'assistant') {
              assistantSources = extractAssistantSources(previousMessage.parts as UIMessagePartLike[]);
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
