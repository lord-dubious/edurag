import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';

function maskSecret(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return value.slice(0, 4) + '****' + value.slice(-4);
}

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      onboarded: settings?.onboarded ?? false,
      branding: {
        primaryColor: settings?.brandPrimary,
        secondaryColor: settings?.brandSecondary,
        logoUrl: settings?.brandLogoUrl,
        emoji: settings?.emoji,
        iconType: settings?.iconType,
        showTitle: settings?.showTitle,
        appName: settings?.appName,
      },
      apiKeys: {
        mongodbUri: maskSecret(process.env.MONGODB_URI),
        chatApiKey: maskSecret(process.env.CHAT_API_KEY),
        tavilyApiKey: maskSecret(process.env.TAVILY_API_KEY),
        embeddingApiKey: maskSecret(process.env.EMBEDDING_API_KEY),
        deepgramApiKey: maskSecret(process.env.DEEPGRAM_API_KEY),
      },
      config: {
        chatModel: process.env.CHAT_MODEL,
        chatBaseUrl: process.env.CHAT_BASE_URL,
        crawlMaxDepth: process.env.CRAWL_MAX_DEPTH,
        crawlLimit: process.env.CRAWL_LIMIT,
      },
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
