import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { nextCookies } from 'better-auth/next-js';
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

  if (process.env.NODE_ENV === 'production' && !env.BETTER_AUTH_URL && !env.AUTH_URL) {
    throw new Error('BETTER_AUTH_URL or AUTH_URL is required in production');
  }

  const baseURL = env.BETTER_AUTH_URL ?? env.AUTH_URL ?? 'http://localhost:3000';
  const trustedOrigins = [baseURL];

  return betterAuth({
    database: mongodbAdapter(db),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    secret: env.AUTH_SECRET,
    baseURL,
    trustedOrigins,
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
    plugins: [nextCookies()],
  });
}

export const auth = await buildAuth();
export type Session = typeof auth.$Infer.Session;
