import { ObjectId } from 'mongodb';
import type { Collection, Filter, UpdateFilter } from 'mongodb';
import { getMongoCollection } from './vectorstore';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ConversationDocument {
  _id?: ObjectId;
  threadId: string;
  userId?: string | null;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  _id: ObjectId;
  threadId: string;
  userId?: string | null;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const CONVERSATIONS_COLLECTION = 'conversations';

export async function getConversationsCollection(): Promise<Collection<ConversationDocument>> {
  return getMongoCollection<ConversationDocument>(CONVERSATIONS_COLLECTION);
}

export async function getHistory(threadId: string, userId?: string): Promise<Message[]> {
  const collection = await getConversationsCollection();
  const query: Filter<ConversationDocument> = { threadId };
  if (userId) {
    // Access own threads or anonymous threads
    query.$or = [{ userId }, { userId: { $exists: false } }, { userId: null }];
  }
  const conversation = await collection.findOne(query);
  return conversation?.messages ?? [];
}

export async function appendMessage(threadId: string, message: Message, userId?: string): Promise<void> {
  const collection = await getConversationsCollection();
  const existing = await collection.findOne({ threadId });

  if (existing) {
    // Security check: If thread belongs to another user, prevent write.
    if (existing.userId && userId && existing.userId !== userId) {
      console.error(`[appendMessage] Unauthorized write attempt to thread ${threadId} by user ${userId}`);
      throw new Error('Unauthorized: Cannot write to another user\'s thread');
    }

    const update: UpdateFilter<ConversationDocument> = !existing.userId && userId
      ? {
        $push: { messages: message },
        $set: { updatedAt: new Date(), userId },
      }
      : {
        $push: { messages: message },
        $set: { updatedAt: new Date() },
      };

    await collection.updateOne(
      { threadId },
      update,
    );
  } else {
    await collection.insertOne({
      threadId,
      userId: userId || null,
      messages: [message],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export async function clearHistory(threadId: string, userId?: string): Promise<void> {
  const collection = await getConversationsCollection();
  const query: Filter<ConversationDocument> = { threadId };
  if (userId) {
    query.userId = userId;
  }
  await collection.deleteOne(query);
}

export async function listConversations(limit = 20): Promise<Conversation[]> {
  const collection = await getConversationsCollection();
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 100))
    : 20;
  const docs = await collection
    .find({})
    .sort({ updatedAt: -1 })
    .limit(safeLimit)
    .toArray();
  return docs as Conversation[];
}

export async function getUserConversations(userId: string, limit = 20): Promise<Conversation[]> {
  const collection = await getConversationsCollection();
  const safeLimit = Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 100))
    : 20;
  const docs = await collection
    .find({ userId })
    .sort({ updatedAt: -1 })
    .limit(safeLimit)
    .toArray();
  return docs as Conversation[];
}

export async function getConversation(threadId: string, userId?: string): Promise<Conversation | null> {
  const collection = await getConversationsCollection();
  const query: Filter<ConversationDocument> = { threadId };
  if (userId) {
    query.$or = [{ userId }, { userId: { $exists: false } }, { userId: null }];
  }
  const doc = await collection.findOne(query);
  return doc as Conversation | null;
}

export async function deleteConversation(threadId: string, userId: string): Promise<boolean> {
  const collection = await getConversationsCollection();
  const result = await collection.deleteOne({ threadId, userId });
  return result.deletedCount > 0;
}
