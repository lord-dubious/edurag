import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      isOnboarded: settings?.onboarded ?? false,
      settings: settings,
      uniUrl: settings?.uniUrl,
      brandPrimary: settings?.brandPrimary,
      logoUrl: settings?.brandLogoUrl,
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
