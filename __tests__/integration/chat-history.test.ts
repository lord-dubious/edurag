// Integration test: requires a real MongoDB instance.
import { nanoid } from 'nanoid';
import { beforeEach, describe, expect, it } from 'vitest';
import { appendMessage, getConversation, getConversationsCollection, getHistory, getUserConversations } from '@/lib/conversation';

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

  it('should claim an anonymous conversation when user logs in and replies', async () => {
    const threadId = nanoid();
    const userId = 'user-login';

    // 1. Anonymous chat starts
    await appendMessage(threadId, { role: 'user', content: 'Anon Hello', timestamp: new Date() });

    // Verify anonymous
    const anonConv = await getConversation(threadId);
    expect(anonConv?.userId).toBeNull();

    // 2. User logs in and replies (sends next message with userId)
    await appendMessage(threadId, { role: 'user', content: 'User Reply', timestamp: new Date() }, userId);

    // 3. Verify conversation is now owned by user
    const userConv = await getConversation(threadId, userId);
    expect(userConv?.userId).toBe(userId);
    expect(userConv?.messages).toHaveLength(2);

    // 4. Verify it appears in user list
    const list = await getUserConversations(userId);
    expect(list).toHaveLength(1);
    expect(list[0].threadId).toBe(threadId);
  });

  it('should PREVENT appending message to another user thread', async () => {
    const threadId = nanoid();
    const ownerId = 'user-owner';
    const attackerId = 'user-attacker';

    // 1. Owner creates thread
    await appendMessage(threadId, { role: 'user', content: 'My Secret', timestamp: new Date() }, ownerId);

    // 2. Attacker tries to append
    await expect(async () => {
        await appendMessage(threadId, { role: 'user', content: 'Hacked', timestamp: new Date() }, attackerId);
    }).rejects.toThrow('Unauthorized');

    // 3. Verify message was NOT added
    const history = await getHistory(threadId, ownerId);
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe('My Secret');
  });
});
