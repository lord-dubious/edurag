import { NextResponse } from 'next/server';
import { getSettings, updateSettings } from '@/lib/db/settings';
import { env, hasRequiredEnvVars } from '@/lib/env';
import { ensureIndexes } from '@/lib/db/ensureIndexes';
import { errorResponse } from '@/lib/errors';
import { verifyAdmin } from '@/lib/admin-auth';
import { runOnboardingCrawl } from '@/lib/onboarding-crawl';

export async function POST() {
  if (!(await verifyAdmin())) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  try {
    await ensureIndexes();
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


    runOnboardingCrawl({
      universityUrl,
      crawlConfig: {
        maxDepth: env.CRAWL_MAX_DEPTH,
        maxBreadth: env.CRAWL_MAX_BREADTH,
        limit: env.CRAWL_LIMIT,
      },
      crawlerInstructions: env.CRAWL_INSTRUCTIONS,
    }).catch(async (err) => {
      console.error('[Startup] Auto-crawl failed:', err);
      try {
        await updateSettings({ crawlStatus: 'failed' });
      } catch (settingsErr) {
        console.error('[Startup] Failed to update crawlStatus:', settingsErr);
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Auto-crawl started',
      onboarded: true,
      autoCrawl: true,
      universityUrl,
    }, { status: 202 });
  } catch (error) {
    console.error('[Startup] Error:', error);
    return errorResponse('DB_ERROR', 'Startup check failed', 500, error);
  }
}

export async function GET() {
  try {
    await ensureIndexes();
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
