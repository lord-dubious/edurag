import { describe, it, expect, beforeEach } from 'vitest';
import { appendMessage, getHistory, getUserConversations, getConversation } from '@/lib/conversation';
import { getConversationsCollection } from '@/lib/conversation';
import { nanoid } from 'nanoid';

describe('Chat History with User', () => {
  beforeEach(async () => {
    const collection = await getConversationsCollection();
    await collection.deleteMany({});
  });

  it('should save and retrieve messages for a user', async () => {
    const threadId = nanoid();
    const userId = 'user-123';
    const message = {
      role: 'user' as const,
      content: 'Hello',
      timestamp: new Date(),
    };

    await appendMessage(threadId, message, userId);

    const history = await getHistory(threadId, userId);
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('Hello');

    const conversation = await getConversation(threadId, userId);
    expect(conversation).toBeDefined();
    expect(conversation?.userId).toBe(userId);
  });

  it('should list user conversations', async () => {
    const userId = 'user-123';
    const thread1 = nanoid();
    const thread2 = nanoid();

    await appendMessage(thread1, { role: 'user', content: 'Msg 1', timestamp: new Date() }, userId);
    await appendMessage(thread2, { role: 'user', content: 'Msg 2', timestamp: new Date() }, userId);

    const list = await getUserConversations(userId);
    expect(list).toHaveLength(2);
  });

  it('should not return other users conversations', async () => {
    const userId1 = 'user-1';
    const userId2 = 'user-2';
    const thread1 = nanoid();

    await appendMessage(thread1, { role: 'user', content: 'Msg 1', timestamp: new Date() }, userId1);

    const list2 = await getUserConversations(userId2);
    expect(list2).toHaveLength(0);

    const conv = await getConversation(thread1, userId2);
    expect(conv).toBeNull();
  });
});
