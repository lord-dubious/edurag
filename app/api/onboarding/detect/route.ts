import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;
    
    if (!url || typeof url !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'URL is required', 400);
    }
    
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return errorResponse('VALIDATION_ERROR', 'Invalid URL format', 400);
    }
    
    if (!parsedUrl.hostname.includes('.') || parsedUrl.hostname.split('.').pop()?.length! < 2) {
      return errorResponse('VALIDATION_ERROR', 'URL must have a valid domain', 400);
    }
    
    return NextResponse.json({
      success: true,
      url: normalizedUrl,
      domain: parsedUrl.hostname,
    });
  } catch (error) {
    return errorResponse('VALIDATION_ERROR', 'Invalid URL', 400, error);
  }
}
