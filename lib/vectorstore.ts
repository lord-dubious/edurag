import { MongoClient, type Collection, type Document as MongoDocument, type WithId, type OptionalId } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { env } from './env';
import { getEmbeddings, getVoyageClient } from './providers';
import { getSettings } from './db/settings';

declare global {
  var mongoClient: MongoClient | undefined;
}

export async function getMongoClient(customUri?: string): Promise<MongoClient> {
  if (!customUri && globalThis.mongoClient) {
    return globalThis.mongoClient;
  }

  const uri = customUri || env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  const client = new MongoClient(uri);
  await client.connect();

  if (!customUri) {
    globalThis.mongoClient = client;
  }
  return client;
}

export async function getMongoCollection<TSchema extends MongoDocument = MongoDocument>(
  collectionName: string,
  customUri?: string
): Promise<Collection<TSchema>> {
  const client = await getMongoClient(customUri);
  return client.db(env.DB_NAME).collection<TSchema>(collectionName);
}

export type { MongoDocument, WithId, OptionalId };

export async function getVectorStore() {
  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  const settings = await getSettings();
  const embeddingConfig = settings?.embeddingConfig;
  const embeddingsInstance = getEmbeddings(
    embeddingConfig?.apiKey,
    embeddingConfig?.model,
    embeddingConfig?.dimensions,
  );

  const vectorStore = new MongoDBAtlasVectorSearch(embeddingsInstance, {
    collection,
    indexName: env.VECTOR_INDEX_NAME,
    textKey: 'text',
    embeddingKey: 'embedding',
  });

  return vectorStore;
}

export async function similaritySearchWithScore(
  query: string,
  k: number = 5
): Promise<[import('@langchain/core/documents').Document, number][]> {
  const limit = Math.max(1, Math.floor(k));
  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  const settings = await getSettings();
  const embeddingConfig = settings?.embeddingConfig;
  const rerankConfig = settings?.rerankConfig;
  const embeddingsInstance = getEmbeddings(
    embeddingConfig?.apiKey,
    embeddingConfig?.model,
    embeddingConfig?.dimensions,
  );

  const vectorStore = new MongoDBAtlasVectorSearch(embeddingsInstance, {
    collection,
    indexName: env.VECTOR_INDEX_NAME,
    textKey: 'text',
    embeddingKey: 'embedding',
  });

  const queryEmbedding = await embeddingsInstance.embedQuery(query);

  const broadK = Math.max(limit * 4, 25);
  const allResults = await vectorStore.similaritySearchVectorWithScore(
    queryEmbedding,
    broadK
  );

  if (allResults.length === 0) {
    return allResults;
  }

  let timerId: ReturnType<typeof setTimeout> | undefined;
  const clearRerankTimer = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = undefined;
    }
  };

  try {
    const voyageClient = getVoyageClient(embeddingConfig?.apiKey);

    // Fix LangChain textKey mapping issue by explicitly populating pageContent
    allResults.forEach(([doc]) => {
      doc.pageContent = doc.pageContent || doc.metadata?.content || doc.metadata?.text || '';
    });

    const validResults = allResults.filter(([doc]) => doc.pageContent.trim().length > 0);

    if (validResults.length === 0) {
      return allResults.slice(0, limit);
    }

    const documents = validResults.map(([doc]) => doc.pageContent);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new Error('Rerank timeout')), env.RERANK_TIMEOUT_MS);
    });

    const rerankResponse = await Promise.race([
      voyageClient.rerank({
        query,
        documents,
        model: rerankConfig?.model || env.RERANK_MODEL,
        topK: Math.min(limit, rerankConfig?.topK ?? env.RERANK_TOP_K),
        truncation: true,
      }),
      timeoutPromise,
    ]);
    clearRerankTimer();

    if (rerankResponse.data && rerankResponse.data.length > 0) {
      const rerankedResults = rerankResponse.data
        .filter((item): item is { index: number; relevanceScore?: number } => {
          const idx = item.index;
          return typeof idx === 'number' && idx >= 0 && idx < validResults.length;
        })
        .map((item) => {
          const [doc] = validResults[item.index];
          return [doc, item.relevanceScore ?? 0] as [typeof doc, number];
        });

      if (rerankedResults.length === 0) {
        console.warn('[rerank] Reranking returned no valid results, falling back to original vector search results');
        return allResults.slice(0, limit);
      }

      console.log(
        '[rerank] Reranked',
        allResults.length,
        '→',
        rerankedResults.length,
        'results. Top score:',
        rerankedResults[0]?.[1],
      );

      return rerankedResults;
    }

    console.warn('[rerank] Reranking failed or returned empty data, falling back to original vector search results');
    return allResults.slice(0, limit);
  } catch (err) {
    clearRerankTimer();
    console.error('[rerank] failed, falling back to vector search:', err);
    return allResults.slice(0, limit);
  }
}

export async function closeMongoClient() {
  if (globalThis.mongoClient) {
    await globalThis.mongoClient.close();
    globalThis.mongoClient = undefined;
  }
}
