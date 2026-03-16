import { ObjectId } from 'mongodb';
import { verifyAdmin } from '@/lib/admin-auth';
import { errorResponse } from '@/lib/errors';
import { getMongoCollection } from '@/lib/vectorstore';
import { env } from '@/lib/env';
import type { NextRequest } from 'next/server';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyAdmin(req)) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return errorResponse('VALIDATION_ERROR', 'Invalid FAQ id', 400);
  }
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  const result = await col.updateOne(
    { _id: new ObjectId(id) },
    { $set: { public: false, pendingApproval: false } },
  );

  if (result.matchedCount === 0) {
    return errorResponse('NOT_FOUND', 'FAQ not found', 404);
  }

  return Response.json({ success: true });
}
