export interface AuthConfig {
  baseURL: string;
  trustedOrigins: string[];
}

export interface AuthConfigEnv {
  BETTER_AUTH_URL?: string;
  AUTH_SECRET?: string;
}

export function resolveAuthConfig(
  env: AuthConfigEnv,
  processEnv: NodeJS.ProcessEnv = process.env,
): AuthConfig {
  if (processEnv.NODE_ENV === 'production' && !env.AUTH_SECRET) {
    throw new Error('AUTH_SECRET is required in production');
  }

  const normalizeUrl = (url?: string) => url?.replace(/\/+$/, '');
  const inferredBaseURL = normalizeUrl(
    processEnv.NEXT_PUBLIC_APP_URL
      ?? (processEnv.VERCEL_URL ? `https://${processEnv.VERCEL_URL}` : undefined)
      ?? processEnv.URL
      ?? processEnv.DEPLOY_PRIME_URL,
  );
  const normalizedBetterAuthUrl = normalizeUrl(env.BETTER_AUTH_URL);
  const baseURL = normalizedBetterAuthUrl || inferredBaseURL || 'http://localhost:3000';

  if (processEnv.NODE_ENV === 'production' && baseURL === 'http://localhost:3000') {
    throw new Error('BETTER_AUTH_URL (or NEXT_PUBLIC_APP_URL/VERCEL_URL/URL) is required in production');
  }

  const trustedOrigins = Array.from(new Set([
    baseURL,
    normalizedBetterAuthUrl,
    inferredBaseURL,
  ].filter((value): value is string => Boolean(value))));

  return { baseURL, trustedOrigins };
}
