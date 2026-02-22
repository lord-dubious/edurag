import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindOne = vi.fn();
const mockUpdateOne = vi.fn();
const mockCollection = {
  findOne: mockFindOne,
  updateOne: mockUpdateOne,
};

vi.mock('@/lib/vectorstore', () => ({
  getMongoCollection: vi.fn().mockResolvedValue(mockCollection),
}));

describe('settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('returns settings when found', async () => {
      mockFindOne.mockResolvedValueOnce({
        _id: 'onboarding',
        uniUrl: 'https://example.edu',
        brandPrimary: '#0066cc',
        appName: 'Test University',
        onboarded: true,
        updatedAt: new Date(),
      });

      const { getSettings } = await import('@/lib/db/settings');
      const result = await getSettings();

      expect(result).toMatchObject({
        _id: 'onboarding',
        uniUrl: 'https://example.edu',
        brandPrimary: '#0066cc',
        appName: 'Test University',
        onboarded: true,
      });
    });

    it('returns null when no settings exist', async () => {
      mockFindOne.mockResolvedValueOnce(null);

      const { getSettings } = await import('@/lib/db/settings');
      const result = await getSettings();

      expect(result).toBeNull();
    });
  });

  describe('updateSettings', () => {
    it('saves settings to database', async () => {
      mockUpdateOne.mockResolvedValueOnce({ acknowledged: true });

      const { updateSettings } = await import('@/lib/db/settings');
      await updateSettings({
        uniUrl: 'https://test.edu',
        brandPrimary: '#ff0000',
      });

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'onboarding' },
        {
          $set: { uniUrl: 'https://test.edu', brandPrimary: '#ff0000', updatedAt: expect.any(Date) },
          $setOnInsert: { createdAt: expect.any(Date) },
        },
        { upsert: true }
      );
    });
  });

  describe('isOnboarded', () => {
    it('returns true when onboarded is true', async () => {
      mockFindOne.mockResolvedValueOnce({
        _id: 'onboarding',
        onboarded: true,
      });

      const { isOnboarded } = await import('@/lib/db/settings');
      const result = await isOnboarded();

      expect(result).toBe(true);
    });

    it('returns false when onboarded is false', async () => {
      mockFindOne.mockResolvedValueOnce({
        _id: 'onboarding',
        onboarded: false,
      });

      const { isOnboarded } = await import('@/lib/db/settings');
      const result = await isOnboarded();

      expect(result).toBe(false);
    });

    it('returns false when no settings exist', async () => {
      mockFindOne.mockResolvedValueOnce(null);

      const { isOnboarded } = await import('@/lib/db/settings');
      const result = await isOnboarded();

      expect(result).toBe(false);
    });
  });

  describe('completeOnboarding', () => {
    it('sets onboarded to true', async () => {
      mockUpdateOne.mockResolvedValueOnce({ acknowledged: true });

      const { completeOnboarding } = await import('@/lib/db/settings');
      await completeOnboarding();

      expect(mockUpdateOne).toHaveBeenCalledWith(
        { _id: 'onboarding' },
        {
          $set: { onboarded: true, updatedAt: expect.any(Date) },
          $setOnInsert: { createdAt: expect.any(Date) },
        },
        { upsert: true }
      );
    });
  });

  describe('getEnvPreview', () => {
    it('generates env file content', async () => {
      const { getEnvPreview } = await import('@/lib/db/settings');
      const result = getEnvPreview({
        _id: 'onboarding',
        onboarded: true,
        uniUrl: 'https://test.edu',
        brandPrimary: '#0066cc',
        appName: 'Test University',
        crawlConfig: {
          maxDepth: 3,
          limit: 100,
          excludePaths: ['/admin/*', '/login/*'],
        },
      });

      expect(result).toContain('NEXT_PUBLIC_UNI_URL=https://test.edu');
      expect(result).toContain('BRAND_PRIMARY=#0066cc');
      expect(result).toContain('NEXT_PUBLIC_APP_NAME=Test University');
      expect(result).toContain('CRAWL_MAX_DEPTH=3');
      expect(result).toContain('CRAWL_LIMIT=100');
      expect(result).toContain('CRAWL_EXCLUDE_PATHS=/admin/*,/login/*');
    });

    it('returns empty string when no settings provided', async () => {
      const { getEnvPreview } = await import('@/lib/db/settings');
      const result = getEnvPreview(null);

      expect(result).toBe('');
    });
  });
});
