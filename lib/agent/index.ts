import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { chatModel } from '../providers';
import { AGENT_SYSTEM_PROMPT } from './prompts';
import { createVectorSearchTool, getPopularFaqsTool } from './tools';
import { env } from '../env';
import type { AgentOptions } from './types';

export async function runAgent({
  messages,
  threadId,
  universityName = env.NEXT_PUBLIC_APP_NAME,
  extraTools = {},
  maxSteps = 3,
}: AgentOptions) {
  const system = AGENT_SYSTEM_PROMPT
    .replace('{UNIVERSITY_NAME}', universityName)
    .replace('{CURRENT_DATE}', new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }));

  return streamText({
    model: chatModel,
    system,
    messages: await convertToModelMessages(messages),
    tools: {
      vector_search: createVectorSearchTool(threadId),
      get_popular_faqs: getPopularFaqsTool,
      ...extraTools,
    },
    stopWhen: stepCountIs(maxSteps),
  });
}
