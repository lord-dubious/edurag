import { MongoClient, ObjectId } from 'mongodb';
import { hashPassword } from '../lib/auth/password';

async function seedAdmin() {
    const uri = process.env.MONGODB_URI!;
    const email = process.env.ADMIN_EMAIL!;
    const password = process.env.ADMIN_PASSWORD!;
    if (!uri || !email || !password) throw new Error('MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD required');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(process.env.DB_NAME ?? 'edurag');
    const users = db.collection('users');

    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) {
        await users.updateOne({ email: email.toLowerCase() }, { $set: { role: 'admin' } });
        console.log('Updated existing user to admin role');
    } else {
        const { passwordHash, passwordSalt } = await hashPassword(password);
        await users.insertOne({
            _id: new ObjectId(),
            name: 'Admin',
            email: email.toLowerCase(),
            image: null,
            emailVerified: null,
            passwordHash,
            passwordSalt,
            role: 'admin',
        });
        console.log('Created admin user');
    }
    await client.close();
}

seedAdmin().catch(console.error);
