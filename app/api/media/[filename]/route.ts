import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const resolvedParams = await params;
        const { filename } = resolvedParams;

        // Security check to prevent directory traversal
        if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
            return new NextResponse('Invalid filename', { status: 400 });
        }

        const filePath = path.join(process.cwd(), 'media', filename);
        const fileBuffer = await readFile(filePath);

        // Determine content type based on extension
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'application/octet-stream';
        if (ext === '.png') contentType = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.webp') contentType = 'image/webp';
        else if (ext === '.gif') contentType = 'image/gif';

        return new NextResponse(fileBuffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600, must-revalidate',
            },
        });
    } catch (error) {
        return new NextResponse('File not found', { status: 404 });
    }
}
