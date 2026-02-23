import { getMongoCollection } from './vectorstore';
import { ObjectId, type Collection, type WithId, type Document } from 'mongodb';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ConversationDocument {
  _id?: ObjectId;
  threadId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  _id: ObjectId;
  threadId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const CONVERSATIONS_COLLECTION = 'conversations';

export async function getConversationsCollection(): Promise<Collection<ConversationDocument>> {
  return getMongoCollection<ConversationDocument>(CONVERSATIONS_COLLECTION);
}

export async function getHistory(threadId: string): Promise<Message[]> {
  const collection = await getConversationsCollection();
  const conversation = await collection.findOne({ threadId });
  return conversation?.messages ?? [];
}

export async function appendMessage(threadId: string, message: Message): Promise<void> {
  const collection = await getConversationsCollection();
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
  const collection = await getConversationsCollection();
  await collection.deleteOne({ threadId });
}

export async function listConversations(limit = 20): Promise<Conversation[]> {
  const collection = await getConversationsCollection();
  const docs = await collection
    .find({})
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
  return docs as Conversation[];
}
