import { ObjectId } from 'mongodb';
import { z } from 'zod';
import clientPromise from '@/lib/auth-client';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';
import { hashPassword } from '@/lib/auth/password';

interface RegisterUserDocument {
  _id: ObjectId;
  name: string;
  email: string;
  image: string | null;
  emailVerified: Date | null;
  passwordHash: string;
  passwordSalt: string;
}

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  let body: z.infer<typeof registerSchema>;
  try {
    body = registerSchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid registration payload', 400, err);
  }

  try {
    const client = await clientPromise;
    const db = client.db(env.DB_NAME);
    const users = db.collection<RegisterUserDocument>('users');
    await users.createIndex({ email: 1 }, { unique: true });

    const email = body.email.toLowerCase().trim();
    const exists = await users.findOne({ email });
    if (exists) {
      return errorResponse('VALIDATION_ERROR', 'Email is already registered', 409);
    }

    const { passwordHash, passwordSalt } = await hashPassword(body.password);

    await users.insertOne({
      _id: new ObjectId(),
      name: body.name.trim(),
      email,
      image: null,
      emailVerified: null,
      passwordHash,
      passwordSalt,
    });

    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    return errorResponse('INTERNAL_ERROR', 'Failed to create account', 500, err);
  }
}
