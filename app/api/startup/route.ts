import { NextRequest, NextResponse } from 'next/server';
import { getSettings, updateSettings } from '@/lib/db/settings';
import { env, hasRequiredEnvVars } from '@/lib/env';
import { errorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  
  if (token !== process.env.ADMIN_SECRET && token !== process.env.ADMIN_TOKEN) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  try {
    const settings = await getSettings();
    
    if (settings?.onboarded) {
      return NextResponse.json({
        success: true,
        message: 'Already onboarded',
        onboarded: true,
      });
    }

    const universityUrl = env.UNIVERSITY_URL || settings?.uniUrl;
    
    if (!universityUrl) {
      return NextResponse.json({
        success: true,
        message: 'No university URL configured',
        onboarded: false,
        autoCrawl: false,
      });
    }

    if (!env.AUTO_CRAWL) {
      return NextResponse.json({
        success: true,
        message: 'AUTO_CRAWL not enabled',
        onboarded: false,
        autoCrawl: false,
        universityUrl,
      });
    }

    const requiredEnvVars = {
      MONGODB_URI: !!process.env.MONGODB_URI,
      CHAT_API_KEY: !!process.env.CHAT_API_KEY,
      EMBEDDING_API_KEY: !!process.env.EMBEDDING_API_KEY,
      TAVILY_API_KEY: !!process.env.TAVILY_API_KEY,
      ADMIN_SECRET: !!(process.env.ADMIN_SECRET || process.env.ADMIN_TOKEN),
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([, present]) => !present)
      .map(([name]) => name);

    if (missingVars.length > 0) {
      return NextResponse.json({
        success: false,
        message: `Missing required env vars: ${missingVars.join(', ')}`,
        onboarded: false,
        autoCrawl: true,
      }, { status: 400 });
    }

    await updateSettings({
      onboarded: true,
      uniUrl: universityUrl,
      appName: settings?.appName || 'University Knowledge Base',
      brandPrimary: settings?.brandPrimary || '#3b82f6',
      brandSecondary: settings?.brandSecondary || '#1e40af',
      brandLogoUrl: settings?.brandLogoUrl || '',
      emoji: settings?.emoji || '🎓',
      iconType: settings?.iconType || 'emoji',
      showTitle: settings?.showTitle ?? true,
      crawlConfig: settings?.crawlConfig || {
        maxDepth: env.CRAWL_MAX_DEPTH,
        maxBreadth: env.CRAWL_MAX_BREADTH,
        limit: env.CRAWL_LIMIT,
      },
      crawlStatus: 'pending',
    });

    const crawlResponse = await fetch(new URL('/api/onboarding/crawl', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        universityUrl,
        crawlConfig: {
          maxDepth: env.CRAWL_MAX_DEPTH,
          maxBreadth: env.CRAWL_MAX_BREADTH,
          limit: env.CRAWL_LIMIT,
        },
        crawlerInstructions: env.CRAWL_INSTRUCTIONS,
        fileTypeRules: { pdf: 'index', docx: 'index', csv: 'skip' },
        apiKeys: {
          embeddingApiKey: process.env.EMBEDDING_API_KEY,
          embeddingModel: process.env.EMBEDDING_MODEL,
          embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '2048'),
          tavilyApiKey: process.env.TAVILY_API_KEY,
          mongodbUri: process.env.MONGODB_URI,
        },
      }),
    });

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text();
      return NextResponse.json({
        success: false,
        message: 'Auto-crawl failed',
        error: errorText,
        onboarded: true,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Auto-crawl started',
      onboarded: true,
      autoCrawl: true,
      universityUrl,
    });
  } catch (error) {
    console.error('[Startup] Error:', error);
    return errorResponse('DB_ERROR', 'Startup check failed', 500, error);
  }
}

export async function GET() {
  try {
    const settings = await getSettings();
    
    return NextResponse.json({
      onboarded: settings?.onboarded ?? false,
      autoCrawl: env.AUTO_CRAWL,
      universityUrl: env.UNIVERSITY_URL || settings?.uniUrl || null,
      crawlStatus: settings?.crawlStatus || null,
      hasRequiredEnvVars: hasRequiredEnvVars(),
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get startup status', 500, error);
  }
}
