import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      isOnboarded: settings?.onboarded ?? false,
      uniUrl: settings?.uniUrl ?? null,
      brandPrimary: settings?.brandPrimary ?? null,
      logoUrl: settings?.brandLogoUrl ?? null,
      appName: settings?.appName ?? null,
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
