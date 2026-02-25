import { describe, it, expect, vi, beforeEach } from 'vitest';
import { approveFaq, rejectFaq } from '../lib/faq-manager';
import { getMongoCollection } from '../lib/vectorstore';
import { ObjectId } from 'mongodb';

vi.mock('../lib/vectorstore');
vi.mock('../lib/env', () => ({
  env: {
    FAQ_COLLECTION: 'faqs',
  },
}));

describe('FAQ Manager Unit Tests', () => {
  const mockUpdateOne = vi.fn();
  const mockCollection = {
    updateOne: mockUpdateOne,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getMongoCollection as any).mockResolvedValue(mockCollection);
  });

  it('approveFaq should update document with public: true', async () => {
    const faqId = new ObjectId().toString();
    await approveFaq(faqId);

    expect(getMongoCollection).toHaveBeenCalledWith('faqs');

    // Check arguments manually to handle ObjectId comparison if needed,
    // but deep equality usually works for ObjectId in Jest/Vitest
    const [filter, update] = mockUpdateOne.mock.calls[0];
    expect(filter._id.toString()).toBe(faqId);
    expect(update).toEqual({ $set: { public: true, pendingApproval: false } });
  });

  it('rejectFaq should update document with public: false', async () => {
    const faqId = new ObjectId().toString();
    await rejectFaq(faqId);

    expect(getMongoCollection).toHaveBeenCalledWith('faqs');

    const [filter, update] = mockUpdateOne.mock.calls[0];
    expect(filter._id.toString()).toBe(faqId);
    expect(update).toEqual({ $set: { public: false, pendingApproval: false } });
  });
});
