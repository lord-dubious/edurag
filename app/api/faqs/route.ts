import { getPublicFaqs } from '@/lib/faq-manager';
import { verifyAdmin } from '@/lib/admin-auth';
import { getMongoCollection } from '@/lib/vectorstore';
import { env } from '@/lib/env';
import { ObjectId } from 'mongodb';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const wantsAll = searchParams.get('all') === 'true';

  if (wantsAll && !verifyAdmin(req)) {
    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  if (wantsAll) {
    const col = await getMongoCollection(env.FAQ_COLLECTION);
    const faqs = await col.find({}).sort({ updatedAt: -1 }).limit(200).toArray();

    return Response.json({
      success: true,
      data: faqs.map(f => ({
        _id: f._id instanceof ObjectId ? f._id.toString() : String(f._id),
        question: f.question,
        answer: f.answer,
        count: f.count ?? 0,
        public: Boolean(f.public),
        pendingApproval: Boolean(f.pendingApproval),
      })),
    });
  }

  const faqs = await getPublicFaqs(20);

  return Response.json({
    success: true,
    data: faqs.map(f => ({
      id: f._id.toString(),
      question: f.question,
      answer: f.answer,
      count: f.count,
    })),
  });
}
