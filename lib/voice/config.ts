import { AGENT_SYSTEM_PROMPT } from '@/lib/agent/prompts';
import { env } from '@/lib/env';

export function getVoiceAgentInstructions(): string {
  let universityName = 'the university';
  try {
    const url = env.UNIVERSITY_URL ? new URL(env.UNIVERSITY_URL) : null;
    if (url) universityName = url.hostname.replace('www.', '');
  } catch {
    // malformed URL — keep default
  }

  return AGENT_SYSTEM_PROMPT
    .replace(/{UNIVERSITY_NAME}/g, universityName)
    .replace(/{CURRENT_DATE}/g, new Date().toLocaleDateString());
}

export function getVoiceAgentOptions(baseUrl: string) {
  return {
    language: 'en',
    listenModel: env.DEEPGRAM_STT_MODEL,

    thinkProviderType: 'open_ai',
    thinkModel: env.CHAT_MODEL,
    thinkEndpointUrl: env.CHAT_BASE_URL || undefined,
    thinkApiKey: env.CHAT_API_KEY,

    voice: env.DEEPGRAM_TTS_MODEL,
    instructions: getVoiceAgentInstructions(),
    greeting: "Hello! I'm your university assistant. Ask me anything about admissions, programs, tuition, or campus life.",

    functions: [
      {
        name: 'vector_search',
        description: 'Search the university knowledge base for information about programs, admissions, tuition, campus life, and more. Use this for any university-related questions.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant information',
            },
            topK: {
              type: 'number',
              description: 'Number of results to return (default 6)',
            },
          },
          required: ['query'],
        },
        endpoint: {
          url: `${baseUrl}/api/voice-function`,
          method: 'POST',
        },
      },
    ],
  };
}

export const VOICE_CONVERSATION_KEY = 'edurag-voice-conversation';
