import { getMongoCollection } from '../vectorstore';

export interface OnboardingSettings {
  _id: string;
  onboarded: boolean;
  uniUrl?: string;
  appName?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  brandLogoUrl?: string;
  emoji?: string;
  iconType?: 'logo' | 'emoji' | 'upload';
  showTitle?: boolean;
  externalUrls?: string[];
  excludePaths?: string[];
  crawlConfig?: {
    maxDepth?: number;
    limit?: number;
    excludePaths?: string[];
  };
  fileTypeRules?: {
    pdf: 'index' | 'skip';
    docx: 'index' | 'skip';
    csv: 'index' | 'skip';
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const SETTINGS_ID = 'onboarding';

export async function getSettings(): Promise<OnboardingSettings | null> {
  const collection = await getMongoCollection<OnboardingSettings>('settings');
  return collection.findOne({ _id: SETTINGS_ID });
}

export async function isOnboarded(): Promise<boolean> {
  const settings = await getSettings();
  return settings?.onboarded === true;
}

export async function updateSettings(data: Partial<Omit<OnboardingSettings, '_id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
  const collection = await getMongoCollection<OnboardingSettings>('settings');
  await collection.updateOne(
    { _id: SETTINGS_ID },
    {
      $set: {
        ...data,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function completeOnboarding(): Promise<void> {
  await updateSettings({ onboarded: true });
}

export function getEnvPreview(settings: OnboardingSettings | null): string {
  if (!settings) {
    return '';
  }
  
  const lines: string[] = [];
  
  if (settings.uniUrl) {
    lines.push(`NEXT_PUBLIC_UNI_URL=${settings.uniUrl}`);
  }
  
  if (settings.brandPrimary) {
    lines.push(`BRAND_PRIMARY=${settings.brandPrimary}`);
  }
  
  if (settings.appName) {
    lines.push(`NEXT_PUBLIC_APP_NAME=${settings.appName}`);
  }
  
  if (settings.brandLogoUrl) {
    lines.push(`BRAND_LOGO_URL=${settings.brandLogoUrl}`);
  }
  
  if (settings.emoji) {
    lines.push(`BRAND_EMOJI=${settings.emoji}`);
  }
  
  if (settings.brandSecondary) {
    lines.push(`BRAND_SECONDARY=${settings.brandSecondary}`);
  }
  
  if (settings.externalUrls && settings.externalUrls.length > 0) {
    lines.push(`EXTERNAL_URLS=${settings.externalUrls.join(',')}`);
  }
  
  if (settings.crawlConfig?.maxDepth !== undefined) {
    lines.push(`CRAWL_MAX_DEPTH=${settings.crawlConfig.maxDepth}`);
  }
  
  if (settings.crawlConfig?.limit !== undefined) {
    lines.push(`CRAWL_LIMIT=${settings.crawlConfig.limit}`);
  }
  
  if (settings.crawlConfig?.excludePaths && settings.crawlConfig.excludePaths.length > 0) {
    lines.push(`CRAWL_EXCLUDE_PATHS=${settings.crawlConfig.excludePaths.join(',')}`);
  } else if (settings.excludePaths && settings.excludePaths.length > 0) {
    lines.push(`CRAWL_EXCLUDE_PATHS=${settings.excludePaths.join(',')}`);
  }
  
  return lines.join('\n');
}
