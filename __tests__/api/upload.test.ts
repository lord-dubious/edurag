import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

import { writeFile, mkdir } from 'fs/promises';

const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);

function createUploadRequest(file: File | null): Request {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  });
}

function createMockFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a valid image file', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = createMockFile('fake image content', 'logo.png', 'image/png');
    const req = createUploadRequest(file);

    const response = await POST(req as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toMatch(/^\/uploads\/logo-\d+\.png$/);
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockMkdir).toHaveBeenCalled();
  });

  it('returns 400 for missing file', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const req = createUploadRequest(null);

    const response = await POST(req as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid file type', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = createMockFile('fake content', 'document.pdf', 'application/pdf');
    const req = createUploadRequest(file);

    const response = await POST(req as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('accepts SVG files', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = createMockFile('<svg></svg>', 'logo.svg', 'image/svg+xml');
    const req = createUploadRequest(file);

    const response = await POST(req as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.fileName).toMatch(/^logo-\d+\.svg$/);
  });

  it('accepts WebP files', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = createMockFile('webp content', 'logo.webp', 'image/webp');
    const req = createUploadRequest(file);

    const response = await POST(req as any);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
