import { createOpenAI } from '@ai-sdk/openai';
import { VoyageEmbeddings } from '@langchain/community/embeddings/voyage';
import { VoyageAIClient } from 'voyageai';
import { env } from './env';

let _chatProvider: ReturnType<typeof createOpenAI> | undefined;
let _chatModel: ReturnType<ReturnType<typeof createOpenAI>['chat']> | undefined;
let _embeddings: VoyageEmbeddings | undefined;
let _voyageClient: VoyageAIClient | undefined;

export function getVoyageClient(): VoyageAIClient {
  if (!_voyageClient) {
    _voyageClient = new VoyageAIClient({ apiKey: env.EMBEDDING_API_KEY });
  }
  return _voyageClient;
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

  const hasOverrides = Boolean(model || dimensions);
  if (!apiKey && !hasOverrides && _embeddings) {
    return _embeddings;
  }

  if (!key) {
    throw new Error('Embedding API key is required');
  }

  const instance = new VoyageEmbeddings({
    apiKey: key,
    modelName,
    outputDimension,
    inputType: 'document',
    truncation: true,
  });

  if (!apiKey && !hasOverrides) {
    _embeddings = instance;
  }

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
