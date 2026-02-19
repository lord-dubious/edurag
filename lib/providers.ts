import { createOpenAI } from '@ai-sdk/openai';
import { VoyageEmbeddings } from '@langchain/community/embeddings/voyage';
import { env } from './env';

export const chatProvider = createOpenAI({
  apiKey: env.CHAT_API_KEY,
  baseURL: env.CHAT_BASE_URL,
});

export const chatModel = chatProvider.chat(env.CHAT_MODEL);

export const embeddings = new VoyageEmbeddings({
  apiKey: env.EMBEDDING_API_KEY,
  modelName: env.EMBEDDING_MODEL,
  outputDimension: env.EMBEDDING_DIMENSIONS,
});
