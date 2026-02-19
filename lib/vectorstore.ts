import { MongoClient } from 'mongodb';
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

export async function getMongoCollection(collectionName: string) {
  const client = await getMongoClient();
  return client.db(env.DB_NAME).collection(collectionName);
}

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
  threadId: string,
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
  
  // Fetch more results to allow post-filtering
  // This ensures we don't miss relevant documents from other threads
  const fetchCount = Math.max(k * 3, 20);
  
  const allResults = await vectorStore.similaritySearchVectorWithScore(
    queryEmbedding,
    fetchCount
  );
  
  // Post-filter by threadId (filter in code, not in MongoDB)
  // This is more accurate as it searches ALL data first
  const filteredResults = allResults
    .filter(([doc]) => doc.metadata.threadId === threadId)
    .slice(0, k);
  
  return filteredResults;
}

export async function closeMongoClient() {
  if (client) {
    await client.close();
    client = null;
  }
}
