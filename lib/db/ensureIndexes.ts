import { ensureUserEmailIndex } from '@/lib/auth/ensureUserEmailIndex';
import clientPromise from '@/lib/mongodb';
import { env } from '@/lib/env';

let ensureIndexesPromise: Promise<void> | null = null;

export function ensureIndexes(): Promise<void> {
    if (!ensureIndexesPromise) {
        ensureIndexesPromise = (async () => {
            try {
                await ensureUserEmailIndex();

                const client = await clientPromise;
                const db = client.db(env.DB_NAME);

                await db.collection('conversations').createIndex(
                    { threadId: 1 },
                    { unique: true }
                );

                await db.collection(env.DOMAINS_COLLECTION).createIndex(
                    { url: 1 },
                    { unique: true }
                );

                await db.collection(env.FAQ_COLLECTION).createIndex(
                    { normalized: 1 },
                    { unique: true }
                );

            } catch (err) {
                console.error('[ensureIndexes] Error creating indexes:', err);
                ensureIndexesPromise = null;
                throw err;
            }
        })();
    }
    return ensureIndexesPromise;
}
