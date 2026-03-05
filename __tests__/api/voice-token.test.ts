import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
    env: {
        DEEPGRAM_API_KEY: 'test-api-key',
    },
}));

vi.mock('@/lib/errors', () => ({
    errorResponse: vi.fn((code: string, message: string, status: number) => {
        return new Response(JSON.stringify({ error: message, code }), { status });
    }),
}));

import { auth } from '@/auth';
import { env } from '@/lib/env';

const mockAuth = vi.mocked(auth);

describe('GET /api/voice-token', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        mockAuth.mockResolvedValue({
            user: { id: 'user-1', name: 'Test', email: 'test@test.com' },
            expires: new Date(Date.now() + 86400000).toISOString(),
        });
    });

    it('should return a token on successful Deepgram response', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ access_token: 'dg_temp_token_abc' }), { status: 200 }),
        );

        const { GET } = await import('@/app/api/voice-token/route');
        const response = await GET();
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.apiKey).toBe('dg_temp_token_abc');
    });

    it('should return 401 when not authenticated', async () => {
        mockAuth.mockResolvedValueOnce(null);

        const { GET } = await import('@/app/api/voice-token/route');
        const response = await GET();

        expect(response.status).toBe(401);
    });

    it('should return 500 when DEEPGRAM_API_KEY is missing', async () => {
        const originalKey = env.DEEPGRAM_API_KEY;
        (env as Record<string, unknown>).DEEPGRAM_API_KEY = '';

        const { GET } = await import('@/app/api/voice-token/route');
        const response = await GET();

        expect(response.status).toBe(500);
        (env as Record<string, unknown>).DEEPGRAM_API_KEY = originalKey;
    });

    it('should return 500 when Deepgram returns non-OK status', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response('Not Found', { status: 404 }),
        );

        const { GET } = await import('@/app/api/voice-token/route');
        const response = await GET();

        expect(response.status).toBe(500);
        const data = await response.json();
        expect(data.code).toBe('INTERNAL_ERROR');
    });

    it('should return 502 when Deepgram responds with empty access_token', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ access_token: '' }), { status: 200 }),
        );

        const { GET } = await import('@/app/api/voice-token/route');
        const response = await GET();

        expect(response.status).toBe(502);
    });

    it('should return 502 when Deepgram responds with no access_token field', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ something_else: 'value' }), { status: 200 }),
        );

        const { GET } = await import('@/app/api/voice-token/route');
        const response = await GET();

        expect(response.status).toBe(502);
    });

    it('should call the correct Deepgram auth/grant endpoint', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
            new Response(JSON.stringify({ access_token: 'token123' }), { status: 200 }),
        );

        const { GET } = await import('@/app/api/voice-token/route');
        await GET();

        expect(fetchSpy).toHaveBeenCalledWith(
            'https://api.deepgram.com/v1/auth/grant',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    Authorization: 'Token test-api-key',
                }),
            }),
        );
    });
});
