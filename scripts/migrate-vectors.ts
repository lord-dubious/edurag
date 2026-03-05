import { MongoClient } from 'mongodb';
import { env } from '../lib/env';

async function main(): Promise<void> {
    if (!env.MONGODB_URI) throw new Error('Missing MONGODB_URI');
    const client = new MongoClient(env.MONGODB_URI);
    try {
        await client.connect();
        const db = client.db(env.DB_NAME);
        const collection = db.collection(env.VECTOR_COLLECTION);

        const cursor = collection.find({});
        let updatedCount = 0;

        for await (const doc of cursor) {
            let changed = false;
            const update: Record<string, Record<string, unknown>> = { $set: {} };

            if (!doc.crawledAt && !doc.createdAt) {
                update.$set.crawledAt = new Date();
                changed = true;
            } else if (!doc.crawledAt && doc.createdAt) {
                update.$set.crawledAt = doc.createdAt;
                changed = true;
            }

            if (typeof doc.chunkIndex !== 'number' || typeof doc.totalChunks !== 'number') {
                update.$set.chunkIndex = typeof doc.chunkIndex === 'number' ? doc.chunkIndex : 0;
                update.$set.totalChunks = typeof doc.totalChunks === 'number' ? doc.totalChunks : 1;
                changed = true;
            }

            if (typeof doc.text === 'string' && !doc.content) {
                update.$set.content = doc.text;
                changed = true;
            }

            if (!doc.updatedAt) {
                update.$set.updatedAt = new Date();
                changed = true;
            }

            if (!doc.sourceType) {
                update.$set.sourceType = 'university';
                changed = true;
            }

            if (!doc.title) {
                update.$set.title = typeof doc.url === 'string' ? doc.url.split('/').pop() || 'Untitled' : 'Untitled';
                changed = true;
            }

            if (changed) {
                await collection.updateOne({ _id: doc._id }, update);
                updatedCount++;
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} documents.`);
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
