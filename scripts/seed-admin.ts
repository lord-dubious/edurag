import { MongoClient, ObjectId } from 'mongodb';
import { hashPassword } from '../lib/auth/password';

async function seedAdmin(): Promise<void> {
    const uri = process.env.MONGODB_URI!;
    const email = process.env.ADMIN_EMAIL!;
    const password = process.env.ADMIN_PASSWORD!;
    if (!uri || !email || !password) throw new Error('MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD required');

    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db(process.env.DB_NAME ?? 'edurag');
        const users = db.collection('users');

        const { passwordHash, passwordSalt } = await hashPassword(password);
        await users.updateOne(
            { email: email.toLowerCase() },
            {
                $set: { role: 'admin' },
                $setOnInsert: {
                    _id: new ObjectId(),
                    name: 'Admin',
                    email: email.toLowerCase(),
                    image: null,
                    emailVerified: null,
                    passwordHash,
                    passwordSalt,
                },
            },
            { upsert: true },
        );
        console.log('Admin user ensured');
    } finally {
        await client.close();
    }
}

seedAdmin().catch((err) => {
    console.error(err);
    process.exit(1);
});
