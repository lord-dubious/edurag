import { ObjectId } from 'mongodb';
import { getMongoCollection } from './vectorstore';
import type { Collection, Filter } from 'mongodb';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface ConversationDocument {
  _id?: ObjectId;
  threadId: string;
  userId?: string | null;
  title?: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  _id: ObjectId;
  threadId: string;
  userId?: string | null;
  title?: string;
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

  if (existing && existing.userId && (!userId || existing.userId !== userId)) {
    console.error('[appendMessage] Unauthorized write attempt to thread ***masked*** by user ***masked***');
    throw new Error('Unauthorized: Cannot write to another user\'s thread');
  }

  let filter: Filter<ConversationDocument>;
  if (existing && existing.userId) {
    filter = { threadId, userId: existing.userId };
  } else if (!existing && userId) {
    filter = { threadId };
  } else {
    filter = { threadId };
  }

  const update: Record<string, Record<string, unknown>> = {
    $push: { messages: message },
    $set: { updatedAt: new Date() },
    $setOnInsert: {
      threadId,
      createdAt: new Date(),
    },
  };

  if (userId && (!existing || !existing.userId)) {
    update.$set.userId = userId;
  } else if (!existing && !userId) {
    update.$setOnInsert.userId = null;
  }

  await collection.updateOne(
    filter,
    update,
    { upsert: true },
  );
}

export async function updateConversationTitle(threadId: string, title: string, userId?: string): Promise<boolean> {
  const collection = await getConversationsCollection();
  const query: Filter<ConversationDocument> = { threadId };
  if (userId) {
    query.$or = [{ userId }, { userId: null }, { userId: { $exists: false } }];
  } else {
    query.$or = [{ userId: null }, { userId: { $exists: false } }];
  }

  const result = await collection.updateOne(
    query,
    {
      $set: { title, updatedAt: new Date() }
    }
  );

  return result.modifiedCount > 0;
}

function normalizeLimit(limit: number): number {
  return Number.isFinite(limit)
    ? Math.max(1, Math.min(Math.floor(limit), 100))
    : 20;
}

export async function clearHistory(threadId: string, userId?: string): Promise<void> {
  const collection = await getConversationsCollection();
  const query: Filter<ConversationDocument> = { threadId };
  if (userId) {
    query.userId = userId;
  }
  await collection.deleteOne(query);
}



export async function getUserConversations(userId: string, limit = 20): Promise<Conversation[]> {
  const collection = await getConversationsCollection();
  const safeLimit = normalizeLimit(limit);
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
