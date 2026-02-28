import clientPromise from '@/lib/auth-client';
import { env } from '@/lib/env';

let ensureUserEmailIndexPromise: Promise<void> | null = null;

export function ensureUserEmailIndex(): Promise<void> {
  if (!ensureUserEmailIndexPromise) {
    ensureUserEmailIndexPromise = (async () => {
      try {
        const client = await clientPromise;
        const db = client.db(env.DB_NAME);
        const users = db.collection('users');
        await users.createIndex({ email: 1 }, { unique: true });
      } catch (error) {
        ensureUserEmailIndexPromise = null;
        throw error;
      }
    })();
  }

  return ensureUserEmailIndexPromise;
}
