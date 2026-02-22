import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { chatModel } from '../providers';
import { AGENT_SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT_SUFFIX } from './prompts';
import { createVectorSearchTool, getPopularFaqsTool } from './tools';
import { env } from '../env';
import type { AgentOptions } from './types';

export async function runAgent({
  messages,
  threadId,
  universityName = env.NEXT_PUBLIC_APP_NAME,
  extraTools = {},
  maxSteps = 5,
  voiceMode = false,
}: AgentOptions) {
  let system = AGENT_SYSTEM_PROMPT
    .replace('{UNIVERSITY_NAME}', universityName)
    .replace('{CURRENT_DATE}', new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }));

  if (voiceMode) {
    system += VOICE_SYSTEM_PROMPT_SUFFIX;
  }

  console.log('[agent] Running agent with', messages.length, 'messages, maxSteps:', maxSteps, 'voiceMode:', voiceMode);

  return streamText({
    model: chatModel,
    system,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: env.CHAT_MAX_TOKENS,
    temperature: voiceMode ? 0.7 : undefined,
    tools: {
      vector_search: createVectorSearchTool(),
      get_popular_faqs: getPopularFaqsTool,
      ...extraTools,
    },
    stopWhen: stepCountIs(maxSteps),
    experimental_telemetry: { isEnabled: false },
  });
}
