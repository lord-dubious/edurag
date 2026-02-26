import { z } from 'zod';
import { verifyAdmin } from '@/lib/admin-auth';
import { errorResponse } from '@/lib/errors';
import { getMongoCollection } from '@/lib/vectorstore';
import { env } from '@/lib/env';
import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';

const createSchema = z.object({
  url: z.string().url(),
  name: z.string().optional(),
});

export async function GET(req: NextRequest) {
  if (!verifyAdmin(req)) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

  const collection = await getMongoCollection(env.DOMAINS_COLLECTION);
  const domains = await collection.find({}).sort({ createdAt: -1 }).toArray();

  return Response.json({ success: true, data: domains });
}

export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid input', 400, err);
  }

  const collection = await getMongoCollection(env.DOMAINS_COLLECTION);
  
  const existing = await collection.findOne({ url: body.url });
  if (existing) {
    return errorResponse('VALIDATION_ERROR', 'Domain already exists', 400);
  }

  const result = await collection.insertOne({
    url: body.url,
    name: body.name ?? new URL(body.url).hostname,
    threadId: new ObjectId().toString(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const domain = await collection.findOne({ _id: result.insertedId });

  return Response.json({ success: true, data: domain });
}

export async function DELETE(req: NextRequest) {
  if (!verifyAdmin(req)) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get('threadId');

  if (!threadId) {
    return errorResponse('VALIDATION_ERROR', 'threadId is required', 400);
  }

  const collection = await getMongoCollection(env.DOMAINS_COLLECTION);
  const result = await collection.deleteOne({ threadId });

  if (result.deletedCount === 0) {
    return errorResponse('NOT_FOUND', 'Domain not found', 404);
  }

  const { deleteCrawlData } = await import('@/lib/crawl');
  await deleteCrawlData(threadId);

  return Response.json({ success: true });
}
