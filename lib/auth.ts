import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import clientPromise from './auth-client';
import { env } from './env';

async function buildAuth() {
  const client = await clientPromise;
  const db = client.db(env.DB_NAME);

  const socialProviders: Record<string, unknown> = {};

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: env.MICROSOFT_TENANT_ID ?? 'common',
    };
  }

  return betterAuth({
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    secret: env.AUTH_SECRET,
    baseURL: env.AUTH_URL,
    trustedOrigins: [env.AUTH_URL ?? 'http://localhost:3000'],
    socialProviders,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    user: {
      additionalFields: {
        passwordHash: {
          type: 'string',
          required: false,
          defaultValue: null,
          returned: false,
        },
        passwordSalt: {
          type: 'string',
          required: false,
          defaultValue: null,
          returned: false,
        },
      },
    },
  });
}

export const auth = await buildAuth();
export type Session = typeof auth.$Infer.Session;
