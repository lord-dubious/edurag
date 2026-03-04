import { MongoClient } from 'mongodb';
import { env } from '../lib/env';

async function main() {
    if (!env.MONGODB_URI) throw new Error('Missing MONGODB_URI');
    const client = new MongoClient(env.MONGODB_URI);
    await client.connect();
    const db = client.db(env.DB_NAME);
    const collection = db.collection(env.VECTOR_COLLECTION);

    const docs = await collection.find({}).toArray();
    let updatedCount = 0;

    for (const doc of docs) {
        let changed = false;
        const update: any = { $set: {} };

        if (!doc.crawledAt && !doc.createdAt) {
            update.$set.crawledAt = new Date();
            changed = true;
        } else if (!doc.crawledAt && doc.createdAt) {
            update.$set.crawledAt = doc.createdAt;
            changed = true;
        }

        if (typeof doc.chunkIndex !== 'number') {
            update.$set.chunkIndex = 0;
            update.$set.totalChunks = 1;
            changed = true;
        }

        if (doc.text && !doc.content) {
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
            // fallback title
            update.$set.title = doc.url ? doc.url.split('/').pop() || 'Untitled' : 'Untitled';
            changed = true;
        }

        if (changed) {
            await collection.updateOne({ _id: doc._id }, update);
            updatedCount++;
        }
    }

    console.log(`Migration complete. Updated ${updatedCount} documents.`);
    await client.close();
}

main().catch(console.error);
