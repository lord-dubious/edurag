import { MongoDBAdapter } from '@auth/mongodb-adapter';
import { ObjectId } from 'mongodb';
import NextAuth from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { z } from 'zod';
import clientPromise from './lib/auth-client';
import { env } from './lib/env';
import { verifyPassword } from './lib/auth/password';

interface AuthUserDocument {
  _id: ObjectId;
  name?: string | null;
  email: string;
  image?: string | null;
  passwordHash?: string;
  passwordSalt?: string;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const providers: Provider[] = [
  Credentials({
    name: 'Email and Password',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    authorize: async credentials => {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) {
        return null;
      }

      const client = await clientPromise;
      const db = client.db(env.DB_NAME);
      const users = db.collection<AuthUserDocument>('users');
      const user = await users.findOne({ email: parsed.data.email.toLowerCase() });

      if (!user?.passwordHash || !user.passwordSalt) {
        return null;
      }

      const isValid = await verifyPassword(parsed.data.password, user.passwordSalt, user.passwordHash);
      if (!isValid) {
        return null;
      }

      return {
        id: user._id.toString(),
        name: user.name ?? user.email,
        email: user.email,
        image: user.image ?? null,
      };
    },
  }),
];

if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
  providers.push(Google({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  }));
}

if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET && env.MICROSOFT_TENANT_ID) {
  providers.push(MicrosoftEntraID({
    clientId: env.MICROSOFT_CLIENT_ID,
    clientSecret: env.MICROSOFT_CLIENT_SECRET,
    issuer: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/v2.0`,
  }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: MongoDBAdapter(clientPromise),
  providers,
  pages: {
    signIn: '/auth/signin',
  },
  secret: env.AUTH_SECRET,
  callbacks: {
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
});
