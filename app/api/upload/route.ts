import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { errorResponse } from '@/lib/errors';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return errorResponse('VALIDATION_ERROR', 'No file provided', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse('VALIDATION_ERROR', 'Invalid file type. Allowed: PNG, JPEG, SVG, WebP', 400);
    }

    if (file.size > MAX_SIZE) {
      return errorResponse('VALIDATION_ERROR', 'File too large. Max size: 5MB', 400);
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'png';
    const fileName = `logo-${timestamp}.${ext}`;
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
