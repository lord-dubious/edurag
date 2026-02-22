import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { errorResponse } from '@/lib/errors';

const ALLOWED_TYPES: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
};
const MAX_SIZE = 5 * 1024 * 1024;

const FILE_SIGNATURES: Record<string, Buffer> = {
  'image/png': Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  'image/jpeg': Buffer.from([0xFF, 0xD8, 0xFF]),
  'image/webp': Buffer.from([0x52, 0x49, 0x46, 0x46]),
};

function detectMimeType(buffer: Buffer): string | null {
  for (const [mimeType, signature] of Object.entries(FILE_SIGNATURES)) {
    if (buffer.length >= signature.length) {
      const header = buffer.subarray(0, signature.length);
      if (header.equals(signature)) {
        if (mimeType === 'image/webp') {
          const webpHeader = buffer.subarray(8, 12);
          if (webpHeader.toString() === 'WEBP') {
            return mimeType;
          }
          continue;
        }
        return mimeType;
      }
    }
  }
  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const formData = await request.formData();
    const rawFile = formData.get('file');

    if (!rawFile) {
      return errorResponse('VALIDATION_ERROR', 'No file provided', 400);
    }

    if (!(rawFile instanceof File)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid file type', 400);
    }

    const file = rawFile;

    const ext = path.extname(file.name).toLowerCase();
    const allowedExtensions = Object.values(ALLOWED_TYPES).flat();
    if (!allowedExtensions.includes(ext)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid file extension. Allowed: PNG, JPEG, WebP', 400);
    }

    if (!ALLOWED_TYPES[file.type]) {
      return errorResponse('VALIDATION_ERROR', 'Invalid file type. Allowed: PNG, JPEG, WebP', 400);
    }

    if (file.size > MAX_SIZE) {
      return errorResponse('VALIDATION_ERROR', 'File too large. Max size: 5MB', 400);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const detectedType = detectMimeType(buffer);
    if (!detectedType || !ALLOWED_TYPES[detectedType]) {
      return errorResponse('VALIDATION_ERROR', 'Invalid file content. File signature does not match allowed types.', 400);
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await mkdir(uploadDir, { recursive: true });

    const uuid = randomUUID();
    const extension = detectedType.split('/')[1] || 'png';
    const fileName = `logo-${uuid}.${extension}`;
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    const publicUrl = `/uploads/${fileName}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName,
    });
  } catch (error) {
    return errorResponse('UPLOAD_FAILED', 'Failed to upload file', 500, error);
  }
}
