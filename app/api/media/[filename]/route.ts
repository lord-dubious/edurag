import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { errorResponse } from '@/lib/errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
): Promise<Response> {
  try {
    const resolvedParams = await params;
    const { filename } = resolvedParams;

    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return errorResponse('VALIDATION_ERROR', 'Invalid filename', 400);
    }

    const filePath = path.join(process.cwd(), 'media', filename);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await readFile(filePath);
    } catch (readError) {
      const errorCode = (readError as NodeJS.ErrnoException).code;
      if (errorCode === 'ENOENT') {
        return errorResponse('VALIDATION_ERROR', 'File not found', 404);
      }
      console.error('[Media] Error reading file:', readError);
      return errorResponse('INTERNAL_ERROR', 'Failed to read file', 500);
    }

    const ext = path.extname(filename).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.svg' || ext === '.svgz') contentType = 'image/svg+xml';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600, must-revalidate',
    };

    if (ext === '.svg' || ext === '.svgz') {
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:";
    }

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[Media] Unexpected error:', error);
    return errorResponse('INTERNAL_ERROR', 'Internal server error', 500);
  }
}
