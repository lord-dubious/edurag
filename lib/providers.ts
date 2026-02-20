import { createOpenAI } from '@ai-sdk/openai';
import { VoyageEmbeddings } from '@langchain/community/embeddings/voyage';
import { env } from './env';

let _chatProvider: ReturnType<typeof createOpenAI> | undefined;
let _chatModel: ReturnType<typeof createOpenAI>['chat'] extends (...args: any[]) => infer R ? R : never | undefined;
let _embeddings: VoyageEmbeddings | undefined;

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

export function getEmbeddings() {
  if (!_embeddings) {
    _embeddings = new VoyageEmbeddings({
      apiKey: env.EMBEDDING_API_KEY,
      modelName: env.EMBEDDING_MODEL,
      outputDimension: env.EMBEDDING_DIMENSIONS,
    });
  }
  return _embeddings;
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

export const embeddings = new Proxy({} as VoyageEmbeddings, {
  get(_, prop) {
    return getEmbeddings()[prop as keyof VoyageEmbeddings];
  },
});
