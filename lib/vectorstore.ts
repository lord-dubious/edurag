import { MongoClient, type Collection, type Document as MongoDocument, type WithId, type OptionalId } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { env } from './env';
import { getEmbeddings, getVoyageClient } from './providers';

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
  const embeddingsInstance = getEmbeddings();

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
) {
  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  const embeddingsInstance = getEmbeddings();

  const vectorStore = new MongoDBAtlasVectorSearch(embeddingsInstance, {
    collection,
    indexName: env.VECTOR_INDEX_NAME,
    textKey: 'text',
    embeddingKey: 'embedding',
  });

  const queryEmbedding = await embeddingsInstance.embedQuery(query);

  const broadK = Math.max(k * 4, 25);
  const allResults = await vectorStore.similaritySearchVectorWithScore(
    queryEmbedding,
    broadK
  );

  if (allResults.length === 0) {
    return allResults;
  }

  try {
    const voyageClient = getVoyageClient();

    // Fix LangChain textKey mapping issue by explicitly populating pageContent
    allResults.forEach(([doc]) => {
      doc.pageContent = doc.pageContent || doc.metadata?.content || doc.metadata?.text || '';
    });

    const validResults = allResults.filter(([doc]) => doc.pageContent.trim().length > 0);

    if (validResults.length === 0) {
      return allResults.slice(0, k);
    }

    const documents = validResults.map(([doc]) => doc.pageContent);

    const rerankResponse = await voyageClient.rerank({
      query,
      documents,
      model: env.RERANK_MODEL,
      topK: k,
      truncation: true,
    });

    if (rerankResponse.data && rerankResponse.data.length > 0) {
      const rerankedResults = rerankResponse.data.map((item) => {
        const idx = item.index ?? 0;
        const [doc] = validResults[idx];
        return [doc, item.relevanceScore ?? 0] as [typeof doc, number];
      });

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
  } catch (error) {
    console.error('[rerank] Reranking failed, falling back to vector results:', error);
  }

  return allResults.slice(0, k);
}

export async function closeMongoClient() {
  if (globalThis.mongoClient) {
    await globalThis.mongoClient.close();
    globalThis.mongoClient = undefined;
  }
}
