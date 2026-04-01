import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      isOnboarded: settings?.onboarded ?? false,
      uniUrl: settings?.uniUrl,
      appName: settings?.appName,
      brandPrimary: settings?.brandPrimary,
      brandSecondary: settings?.brandSecondary,
      logoUrl: settings?.brandLogoUrl,
      iconType: settings?.iconType,
      showTitle: settings?.showTitle ?? true,
      crawlStatus: settings?.crawlStatus ?? null,
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
