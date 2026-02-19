import { MongoClient, type Document as MongoDocument, type WithId, type OptionalId } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { env } from './env';
import { embeddings } from './providers';

let client: MongoClient | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    client = new MongoClient(env.MONGODB_URI);
    await client.connect();
  }
  return client;
}

export async function getMongoCollection<TSchema extends MongoDocument = MongoDocument>(
  collectionName: string
) {
  const client = await getMongoClient();
  return client.db(env.DB_NAME).collection<TSchema>(collectionName);
}

export type { MongoDocument, WithId, OptionalId };

export async function getVectorStore(threadId?: string) {
  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  
  const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
    collection,
    indexName: env.VECTOR_INDEX_NAME,
    textKey: 'text',
    embeddingKey: 'embedding',
  });
  
  return { vectorStore, threadId };
}

export async function similaritySearchWithScore(
  query: string,
  threadId?: string,
  k: number = 5
) {
  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  
  const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
    collection,
    indexName: env.VECTOR_INDEX_NAME,
    textKey: 'text',
    embeddingKey: 'embedding',
  });
  
  const queryEmbedding = await embeddings.embedQuery(query);
  
  const allResults = await vectorStore.similaritySearchVectorWithScore(
    queryEmbedding,
    k
  );
  
  return allResults;
}

export async function closeMongoClient() {
  if (client) {
    await client.close();
    client = null;
  }
}
