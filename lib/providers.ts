import { createOpenAI } from '@ai-sdk/openai';
import { VoyageEmbeddings } from '@langchain/community/embeddings/voyage';
import { VoyageAIClient } from 'voyageai';
import { env } from './env';

let _chatProvider: ReturnType<typeof createOpenAI> | undefined;
let _chatModel: ReturnType<ReturnType<typeof createOpenAI>['chat']> | undefined;
const _embeddingsCache = new Map<string, VoyageEmbeddings>();
const _voyageClientCache = new Map<string, VoyageAIClient>();

export function getVoyageClient(apiKey?: string): VoyageAIClient {
  const key = apiKey || env.EMBEDDING_API_KEY;
  if (!key) {
    throw new Error('Embedding API key is required');
  }

  const cached = _voyageClientCache.get(key);
  if (cached) {
    return cached;
  }

  const client = new VoyageAIClient({ apiKey: key });
  _voyageClientCache.set(key, client);
  return client;
}

export function getChatProvider() {
  if (!_chatProvider) {
    _chatProvider = createOpenAI({
      apiKey: env.CHAT_API_KEY,
      baseURL: env.CHAT_BASE_URL,
    });
  }
  return _chatProvider;
}

export function getChatModel() {
  if (!_chatModel) {
    _chatModel = getChatProvider().chat(env.CHAT_MODEL);
  }
  return _chatModel;
}

export function getEmbeddings(
  apiKey?: string,
  model?: string,
  dimensions?: number
): VoyageEmbeddings {
  const key = apiKey || env.EMBEDDING_API_KEY;
  const modelName = model || env.EMBEDDING_MODEL;
  const outputDimension = dimensions || env.EMBEDDING_DIMENSIONS;

  if (!key) {
    throw new Error('Embedding API key is required');
  }

  const cacheKey = `${key}:${modelName}:${outputDimension}`;
  const cached = _embeddingsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const instance = new VoyageEmbeddings({
    apiKey: key,
    modelName,
    outputDimension,
    inputType: 'document',
    truncation: true,
  });

  _embeddingsCache.set(cacheKey, instance);
  return instance;
}

export const chatProvider = new Proxy({} as ReturnType<typeof createOpenAI>, {
  get(_, prop) {
    return getChatProvider()[prop as keyof ReturnType<typeof createOpenAI>];
  },
});

export const chatModel = new Proxy({} as ReturnType<ReturnType<typeof createOpenAI>['chat']>, {
  get(_, prop) {
    return getChatModel()[prop as keyof ReturnType<ReturnType<typeof createOpenAI>['chat']>];
  },
});
