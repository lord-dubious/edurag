import { streamText, convertToModelMessages, stepCountIs } from 'ai';
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
  maxSteps = 5,
}: AgentOptions) {
  const system = AGENT_SYSTEM_PROMPT
    .replace('{UNIVERSITY_NAME}', universityName)
    .replace('{CURRENT_DATE}', new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }));

  console.log('[agent] Running agent with', messages.length, 'messages, maxSteps:', maxSteps);

  return streamText({
    model: chatModel,
    system,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: env.CHAT_MAX_TOKENS,
    tools: {
      vector_search: createVectorSearchTool(),
      get_popular_faqs: getPopularFaqsTool,
      ...extraTools,
    },
    stopWhen: stepCountIs(maxSteps),
    experimental_telemetry: { isEnabled: false },
  });
}
