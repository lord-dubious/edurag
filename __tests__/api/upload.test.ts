import { NextRequest } from 'next/server';
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

function createUploadRequest(file: File | null): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  return new NextRequest('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  });
}

function createMockFile(content: string, name: string, type: string): File {
  return new File([content], name, { type });
}

function createMockFileWithSignature(signature: number[], name: string, type: string): File {
  const content = new Uint8Array([...signature, ...new Array(100).fill(0)]);
  return new File([content], name, { type });
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads a valid PNG file with correct signature', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const pngSignature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const file = createMockFileWithSignature(pngSignature, 'logo.png', 'image/png');
    const req = createUploadRequest(file);

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toMatch(/^\/uploads\/logo-[a-f0-9-]+\.png$/);
    expect(mockWriteFile).toHaveBeenCalled();
    expect(mockMkdir).toHaveBeenCalled();
  });

  it('uploads a valid JPEG file with correct signature', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const jpegSignature = [0xFF, 0xD8, 0xFF];
    const file = createMockFileWithSignature(jpegSignature, 'logo.jpg', 'image/jpeg');
    const req = createUploadRequest(file);

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.url).toMatch(/^\/uploads\/logo-[a-f0-9-]+\.jpeg$/);
  });

  it('returns 400 for missing file', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const req = createUploadRequest(null);

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for invalid file extension', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = createMockFile('fake content', 'document.pdf', 'application/pdf');
    const req = createUploadRequest(file);

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('rejects SVG files for security reasons', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = createMockFile('<svg></svg>', 'logo.svg', 'image/svg+xml');
    const req = createUploadRequest(file);

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for file with invalid content signature', async () => {
    const { POST } = await import('@/app/api/upload/route');
    const file = createMockFile('not a real image', 'fake.png', 'image/png');
    const req = createUploadRequest(file);

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.code).toBe('VALIDATION_ERROR');
  });
});
