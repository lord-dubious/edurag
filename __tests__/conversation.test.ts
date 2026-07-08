import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import { getHistory, appendMessage, clearHistory, listConversations, saveMessage } from '../lib/conversation';
import { closeMongoClient } from '../lib/vectorstore';
import { env } from '../lib/env';

const TEST_THREAD_ID = `test-conv-thread-${Date.now()}`;

describe('Conversation Management', () => {
  let client: MongoClient;

  beforeAll(async () => {
    client = new MongoClient(env.MONGODB_URI!);
    await client.connect();
    await clearHistory(TEST_THREAD_ID);
  });

  afterAll(async () => {
    await clearHistory(TEST_THREAD_ID);
    await closeMongoClient();
    await client.close();
  });

  it('should start with empty history', async () => {
    const history = await getHistory(TEST_THREAD_ID);
    expect(history).toEqual([]);
  });

  it('should append user message', async () => {
    await appendMessage(TEST_THREAD_ID, {
      role: 'user',
      content: 'What programs do you offer?',
      timestamp: new Date(),
    });

    const history = await getHistory(TEST_THREAD_ID);
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('What programs do you offer?');
  });

  it('should append assistant message', async () => {
    await appendMessage(TEST_THREAD_ID, {
      role: 'assistant',
      content: 'We offer Computer Science, Engineering, and Business programs.',
      timestamp: new Date(),
    });

    const history = await getHistory(TEST_THREAD_ID);
    expect(history.length).toBe(2);
    expect(history[1].role).toBe('assistant');
  });

  it('should maintain message order', async () => {
    await appendMessage(TEST_THREAD_ID, {
      role: 'user',
      content: 'What about tuition?',
      timestamp: new Date(),
    });

    const history = await getHistory(TEST_THREAD_ID);
    expect(history.length).toBe(3);
    expect(history[2].content).toBe('What about tuition?');
  });

  it('should clear history', async () => {
    await clearHistory(TEST_THREAD_ID);
    
    const history = await getHistory(TEST_THREAD_ID);
    expect(history).toEqual([]);
  });

  it('should list conversations', async () => {
    await appendMessage(TEST_THREAD_ID, {
      role: 'user',
      content: 'Test message for listing',
      timestamp: new Date(),
    });

    const conversations = await listConversations(10);
    const testConv = conversations.find(c => c.threadId === TEST_THREAD_ID);
    
    expect(testConv).toBeDefined();
    expect(testConv?.messages.length).toBe(1);
  });

  it('should update an existing message when saving by id', async () => {
    await clearHistory(TEST_THREAD_ID);

    await saveMessage(TEST_THREAD_ID, {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Partial answer',
      timestamp: new Date(),
    });

    await saveMessage(TEST_THREAD_ID, {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Final answer',
      timestamp: new Date(),
    });

    const history = await getHistory(TEST_THREAD_ID);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: 'assistant-1',
      role: 'assistant',
      content: 'Final answer',
    });
  });
});
