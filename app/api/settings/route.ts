import { NextResponse } from 'next/server';
import { getSettings, type OnboardingSettings } from '@/lib/db/settings';

interface PublicSettings {
  appName: string;
  brandPrimary: string;
  brandSecondary: string;
  brandLogoUrl: string | null;
  emoji: string;
  iconType: 'logo' | 'emoji' | 'upload';
  showTitle: boolean;
  onboarded: boolean;
}

const DEFAULT_SETTINGS: PublicSettings = {
  appName: 'University Knowledge Base',
  brandPrimary: '#3b82f6',
  brandSecondary: '#1e40af',
  brandLogoUrl: null,
  emoji: '🎓',
  iconType: 'emoji',
  showTitle: true,
  onboarded: false,
};

export async function GET() {
  try {
    const settings = await getSettings();
    
    if (!settings) {
      return NextResponse.json(DEFAULT_SETTINGS);
    }

    const publicSettings: PublicSettings = {
      appName: settings.appName || DEFAULT_SETTINGS.appName,
      brandPrimary: settings.brandPrimary || DEFAULT_SETTINGS.brandPrimary,
      brandSecondary: settings.brandSecondary || DEFAULT_SETTINGS.brandSecondary,
      brandLogoUrl: settings.brandLogoUrl || null,
      emoji: settings.emoji || DEFAULT_SETTINGS.emoji,
      iconType: settings.iconType || DEFAULT_SETTINGS.iconType,
      showTitle: settings.showTitle ?? DEFAULT_SETTINGS.showTitle,
      onboarded: settings.onboarded ?? false,
    };

    return NextResponse.json(publicSettings);
  } catch (error) {
    console.error('[Settings API] Error:', error);
    return NextResponse.json(DEFAULT_SETTINGS);
  }
}
