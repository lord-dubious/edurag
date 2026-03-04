import { ObjectId } from 'mongodb';

import { generateText } from 'ai';

import { FAQ_SYNTHESIS_PROMPT } from '@edurag/agent/text/prompts';

import { env } from './env';
import { chatModel } from './providers';
import { getMongoCollection } from './vectorstore';

interface FaqDocument {
  _id: ObjectId;
  question: string;
  normalized: string;
  answer: string | null;
  public: boolean;
  pendingApproval?: boolean;
  synthesisInProgress?: boolean;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function trackAndMaybeGenerateFaq(question: string): Promise<void> {
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  const normalized = question.toLowerCase().trim();

  const result = await col.findOneAndUpdate(
    { normalized },
    {
      $inc: { count: 1 },
      $setOnInsert: { question, normalized, answer: null, public: false, createdAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (result && result.count >= env.FAQ_THRESHOLD && !result.answer && !result.synthesisInProgress) {
    const claim = await col.findOneAndUpdate(
      { _id: result._id, synthesisInProgress: { $ne: true }, answer: null },
      { $set: { synthesisInProgress: true, updatedAt: new Date() } }
    );

    if (claim) {
      try {
        await synthesizeFaqAnswer(result._id.toString(), question);
      } catch (err) {
        console.error('[FAQ] Synthesis failed:', err);
        await col.updateOne(
          { _id: result._id },
          { $set: { synthesisInProgress: false } }
        );
      }
    }
  }
}

async function synthesizeFaqAnswer(faqId: string, question: string) {
  const { text } = await generateText({
    model: chatModel,
    prompt: FAQ_SYNTHESIS_PROMPT.replace('{QUESTION}', question),
  });

  const col = await getMongoCollection(env.FAQ_COLLECTION);
  await col.updateOne(
    { _id: new ObjectId(faqId) },
    { $set: { answer: text, public: false, pendingApproval: true, synthesisInProgress: false } },
  );
}

export async function getPublicFaqs(limit = 10): Promise<FaqDocument[]> {
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  return col
    .find<FaqDocument>({ public: true, answer: { $ne: null } })
    .sort({ count: -1 })
    .limit(limit)
    .toArray();
}

export async function getPendingFaqs(limit = 50): Promise<FaqDocument[]> {
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  return col
    .find<FaqDocument>({ pendingApproval: true, answer: { $ne: null } })
    .sort({ count: -1 })
    .limit(limit)
    .toArray();
}

export async function approveFaq(faqId: string): Promise<void> {
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  await col.updateOne(
    { _id: new ObjectId(faqId) },
    { $set: { public: true, pendingApproval: false } },
  );
}

export async function rejectFaq(faqId: string): Promise<void> {
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  await col.updateOne(
    { _id: new ObjectId(faqId) },
    { $set: { public: false, pendingApproval: false } },
  );
}
