import { describe, it, expect } from 'vitest';
import { resolveAuthConfig } from '@/lib/auth-config';

const buildProcessEnv = (overrides: NodeJS.ProcessEnv): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  ...overrides,
});

describe('resolveAuthConfig', () => {
  it('throws in production when AUTH_SECRET is missing', () => {
    expect(() => resolveAuthConfig(
      { BETTER_AUTH_URL: 'https://example.com' },
      buildProcessEnv({ NODE_ENV: 'production' }),
    )).toThrow('AUTH_SECRET is required in production');
  });

  it('normalizes trailing slashes in BETTER_AUTH_URL', () => {
    const { baseURL } = resolveAuthConfig(
      { BETTER_AUTH_URL: 'https://example.com/', AUTH_SECRET: 'secret' },
      buildProcessEnv({ NODE_ENV: 'production' }),
    );
    expect(baseURL).toBe('https://example.com');
  });

  it('infers baseURL from VERCEL_URL when BETTER_AUTH_URL is missing', () => {
    const { baseURL } = resolveAuthConfig(
      { AUTH_SECRET: 'secret' },
      buildProcessEnv({ NODE_ENV: 'production', VERCEL_URL: 'myapp.vercel.app' }),
    );
    expect(baseURL).toBe('https://myapp.vercel.app');
  });

  it('includes unique normalized trusted origins', () => {
    const { trustedOrigins } = resolveAuthConfig(
      { BETTER_AUTH_URL: 'https://example.com/', AUTH_SECRET: 'secret' },
      buildProcessEnv({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://preview.example.com/' }),
    );
    expect(trustedOrigins).toContain('https://example.com');
    expect(trustedOrigins).toContain('https://preview.example.com');
    expect(new Set(trustedOrigins).size).toBe(trustedOrigins.length);
  });
});
