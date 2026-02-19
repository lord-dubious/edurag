import { getMongoCollection, getMongoClient } from './vectorstore';
import { env } from './env';
import { ObjectId } from 'mongodb';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  _id: ObjectId;
  threadId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export async function getHistory(threadId: string): Promise<Message[]> {
  const collection = await getMongoCollection(env.CONVERSATIONS_COLLECTION);
  const conversation = await collection.findOne({ threadId });
  return conversation?.messages ?? [];
}

export async function appendMessage(threadId: string, message: Message): Promise<void> {
  const collection = await getMongoCollection(env.CONVERSATIONS_COLLECTION);
  const existing = await collection.findOne({ threadId });
  
  if (existing) {
    await collection.updateOne(
      { threadId },
      {
        $push: { messages: message },
        $set: { updatedAt: new Date() },
      },
    );
  } else {
    await collection.insertOne({
      threadId,
      messages: [message],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export async function clearHistory(threadId: string): Promise<void> {
  const collection = await getMongoCollection(env.CONVERSATIONS_COLLECTION);
  await collection.deleteOne({ threadId });
}

export async function listConversations(limit = 20): Promise<Conversation[]> {
  const collection = await getMongoCollection(env.CONVERSATIONS_COLLECTION);
  return collection
    .find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray() as Promise<Conversation[]>;
}
