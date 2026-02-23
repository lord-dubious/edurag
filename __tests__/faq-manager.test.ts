import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MongoClient } from 'mongodb';
import { trackAndMaybeGenerateFaq, getPublicFaqs } from '../lib/faq-manager';
import { getMongoCollection, closeMongoClient } from '../lib/vectorstore';
import { env } from '../lib/env';

describe('FAQ Manager', () => {
  let client: MongoClient;
  const testQuestions = [
    'What are the admission requirements?',
    'How much is tuition?',
    'What are the admission requirements?',
    'How do I apply for financial aid?',
    'What are the admission requirements?',
    'How much is tuition?',
    'What are the admission requirements?',
    'How much is tuition?',
    'What are the admission requirements?',
  ];

  beforeAll(async () => {
    client = new MongoClient(env.MONGODB_URI!);
    await client.connect();

    const collection = await getMongoCollection(env.FAQ_COLLECTION);
    await collection.deleteMany({
      question: { $in: [...new Set(testQuestions)] },
    });
  });

  afterAll(async () => {
    const collection = await getMongoCollection(env.FAQ_COLLECTION);
    await collection.deleteMany({
      question: { $in: [...new Set(testQuestions)] },
    });
    await closeMongoClient();
    await client.close();
  });

  it('should track question frequency', async () => {
    await trackAndMaybeGenerateFaq(testQuestions[0]);

    const collection = await getMongoCollection(env.FAQ_COLLECTION);
    const doc = await collection.findOne({ question: testQuestions[0] });

    expect(doc).not.toBeNull();
    expect(doc?.count).toBe(1);
  });

  it('should increment count for repeated questions', async () => {
    for (let i = 0; i < 5; i++) {
      await trackAndMaybeGenerateFaq(testQuestions[0]);
    }

    const collection = await getMongoCollection(env.FAQ_COLLECTION);
    const doc = await collection.findOne({ question: testQuestions[0] });

    expect(doc?.count).toBe(6);
  });

  it('should normalize questions for deduplication', async () => {
    await trackAndMaybeGenerateFaq('What are the ADMISSION REQUIREMENTS?');

    const collection = await getMongoCollection(env.FAQ_COLLECTION);
    const doc = await collection.findOne({ normalized: 'what are the admission requirements?' });

    expect(doc).not.toBeNull();
    expect(doc?.count).toBe(7);
  });

  it('should return empty array when no public FAQs', async () => {
    const faqs = await getPublicFaqs(10);

    const testFaqs = faqs.filter((f: any) => testQuestions.includes(f.question));
    expect(testFaqs.length).toBe(0);
  });
});
