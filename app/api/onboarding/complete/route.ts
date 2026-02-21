import { NextRequest, NextResponse } from 'next/server';
import { updateSettings, getSettings, completeOnboarding } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      universityUrl, 
      brandPrimary,
      brandSecondary,
      logoUrl,
      emoji,
      iconType,
      universityName,
      externalUrls,
      excludePaths,
      crawlConfig,
      fileTypeRules,
    } = body;
    
    if (!universityUrl) {
      return errorResponse('VALIDATION_ERROR', 'University URL is required', 400);
    }
    if (!brandPrimary) {
      return errorResponse('VALIDATION_ERROR', 'Brand primary color is required', 400);
    }
    if (!universityName) {
      return errorResponse('VALIDATION_ERROR', 'University name is required', 400);
    }
    
    await updateSettings({
      onboarded: true,
      uniUrl: universityUrl,
      appName: universityName,
      brandPrimary: brandPrimary,
      brandSecondary: brandSecondary,
      brandLogoUrl: logoUrl,
      emoji: emoji,
      iconType: iconType || 'emoji',
      externalUrls: externalUrls || [],
      excludePaths: excludePaths || [],
      crawlConfig: crawlConfig || { maxDepth: 3, limit: 300 },
      fileTypeRules: fileTypeRules || { pdf: 'index', docx: 'index', csv: 'skip' },
    });
    
    await completeOnboarding();
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to save onboarding config', 500, error);
  }
}

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      isOnboarded: settings?.onboarded ?? false,
      uniUrl: settings?.uniUrl,
      brandPrimary: settings?.brandPrimary,
      brandSecondary: settings?.brandSecondary,
      logoUrl: settings?.brandLogoUrl,
      emoji: settings?.emoji,
      iconType: settings?.iconType,
      appName: settings?.appName,
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
