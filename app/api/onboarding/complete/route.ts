import { NextRequest, NextResponse } from 'next/server';
import { updateSettings, getSettings, completeOnboarding } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';

interface ApiKeys {
  mongodbUri: string;
  chatApiKey: string;
  chatBaseUrl: string;
  chatModel: string;
  embeddingApiKey: string;
  tavilyApiKey: string;
  adminSecret: string;
}

function writeEnvFile(apiKeys: ApiKeys, settings: Record<string, unknown>) {
  const envPath = path.join(process.cwd(), '.env.local');
  
  let existingEnv = '';
  if (existsSync(envPath)) {
    existingEnv = readFileSync(envPath, 'utf-8');
  }

  const lines = existingEnv.split('\n');
  const envMap = new Map<string, string>();
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envMap.set(key.trim(), valueParts.join('=').trim());
      }
    }
  }

  const updates: Record<string, string | undefined> = {
    MONGODB_URI: apiKeys.mongodbUri,
    CHAT_API_KEY: apiKeys.chatApiKey,
    CHAT_BASE_URL: apiKeys.chatBaseUrl,
    CHAT_MODEL: apiKeys.chatModel,
    EMBEDDING_API_KEY: apiKeys.embeddingApiKey,
    TAVILY_API_KEY: apiKeys.tavilyApiKey,
    ADMIN_TOKEN: apiKeys.adminSecret,
    NEXT_PUBLIC_UNI_URL: settings.uniUrl as string,
    BRAND_PRIMARY: settings.brandPrimary as string,
    BRAND_SECONDARY: settings.brandSecondary as string,
    BRAND_LOGO_URL: settings.brandLogoUrl as string,
    BRAND_EMOJI: settings.emoji as string,
    NEXT_PUBLIC_APP_NAME: settings.appName as string,
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      envMap.set(key, value);
    }
  }

  const newContent = Array.from(envMap.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  writeFileSync(envPath, newContent + '\n');
}

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
      showTitle,
      universityName,
      externalUrls,
      excludePaths,
      crawlConfig,
      fileTypeRules,
      apiKeys,
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
    if (!apiKeys?.mongodbUri) {
      return errorResponse('VALIDATION_ERROR', 'MongoDB connection string is required', 400);
    }
    if (!apiKeys?.chatApiKey) {
      return errorResponse('VALIDATION_ERROR', 'Chat API key is required', 400);
    }
    if (!apiKeys?.embeddingApiKey) {
      return errorResponse('VALIDATION_ERROR', 'Embedding API key is required', 400);
    }
    if (!apiKeys?.tavilyApiKey) {
      return errorResponse('VALIDATION_ERROR', 'Tavily API key is required', 400);
    }
    if (!apiKeys?.adminSecret) {
      return errorResponse('VALIDATION_ERROR', 'Admin secret is required', 400);
    }

    const settings = {
      onboarded: true,
      uniUrl: universityUrl,
      appName: universityName,
      brandPrimary: brandPrimary,
      brandSecondary: brandSecondary,
      brandLogoUrl: logoUrl,
      emoji: emoji,
      iconType: iconType || 'emoji',
      showTitle: showTitle !== false,
      externalUrls: externalUrls || [],
      excludePaths: excludePaths || [],
      crawlConfig: crawlConfig || { maxDepth: 3, limit: 300 },
      fileTypeRules: fileTypeRules || { pdf: 'index', docx: 'index', csv: 'skip' },
    };

    await updateSettings(settings);

    try {
      writeEnvFile(apiKeys, settings);
    } catch (writeError) {
      console.error('Failed to write .env.local:', writeError);
    }

    await completeOnboarding();

    const envPreview = [
      `MONGODB_URI=${apiKeys.mongodbUri}`,
      `CHAT_API_KEY=${apiKeys.chatApiKey}`,
      apiKeys.chatBaseUrl ? `CHAT_BASE_URL=${apiKeys.chatBaseUrl}` : null,
      `CHAT_MODEL=${apiKeys.chatModel || 'llama-3.3-70b'}`,
      `EMBEDDING_API_KEY=${apiKeys.embeddingApiKey}`,
      `TAVILY_API_KEY=${apiKeys.tavilyApiKey}`,
      `ADMIN_TOKEN=${apiKeys.adminSecret}`,
      `NEXT_PUBLIC_UNI_URL=${universityUrl}`,
      `BRAND_PRIMARY=${brandPrimary}`,
      brandSecondary ? `BRAND_SECONDARY=${brandSecondary}` : null,
      logoUrl ? `BRAND_LOGO_URL=${logoUrl}` : null,
      emoji ? `BRAND_EMOJI=${emoji}` : null,
      `NEXT_PUBLIC_APP_NAME=${universityName}`,
    ].filter(Boolean).join('\n');

    const response = NextResponse.json({ 
      success: true,
      envPreview,
      isVercel: process.env.VERCEL === '1',
    });
    response.cookies.set('edurag_onboarded', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: '/',
    });
    return response;
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
      showTitle: settings?.showTitle,
      appName: settings?.appName,
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
