import { MongoClient, type Collection, type Document as MongoDocument, type WithId, type OptionalId } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { env } from './env';
import { getEmbeddings } from './providers';

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
  
  const allResults = await vectorStore.similaritySearchVectorWithScore(
    queryEmbedding,
    k
  );
  
  return allResults;
}

export async function closeMongoClient() {
  if (globalThis.mongoClient) {
    await globalThis.mongoClient.close();
    globalThis.mongoClient = undefined;
  }
}
