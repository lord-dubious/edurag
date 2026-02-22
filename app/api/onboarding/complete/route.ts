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

function sanitizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/[\n\r]/g, '');
}

type EnvEntry = { type: 'comment'; text: string } | { type: 'kv'; key: string; value: string };

function writeEnvFile(apiKeys: ApiKeys, settings: Record<string, unknown>) {
  const envPath = path.join(process.cwd(), '.env.local');
  
  let existingEnv = '';
  if (existsSync(envPath)) {
    existingEnv = readFileSync(envPath, 'utf-8');
  }

  const lines = existingEnv.split('\n');
  const entries: EnvEntry[] = [];
  const envMap = new Map<string, string>();
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('#')) {
      entries.push({ type: 'comment', text: line });
    } else {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const k = key.trim();
        const v = valueParts.join('=').trim();
        entries.push({ type: 'kv', key: k, value: v });
        envMap.set(k, v);
      }
    }
  }

  const updates: Record<string, string | undefined> = {
    MONGODB_URI: sanitizeEnvValue(apiKeys.mongodbUri),
    CHAT_API_KEY: sanitizeEnvValue(apiKeys.chatApiKey),
    CHAT_BASE_URL: sanitizeEnvValue(apiKeys.chatBaseUrl),
    CHAT_MODEL: sanitizeEnvValue(apiKeys.chatModel),
    EMBEDDING_API_KEY: sanitizeEnvValue(apiKeys.embeddingApiKey),
    TAVILY_API_KEY: sanitizeEnvValue(apiKeys.tavilyApiKey),
    ADMIN_TOKEN: sanitizeEnvValue(apiKeys.adminSecret),
    NEXT_PUBLIC_UNI_URL: sanitizeEnvValue(settings.uniUrl as string),
    BRAND_PRIMARY: sanitizeEnvValue(settings.brandPrimary as string),
    BRAND_SECONDARY: sanitizeEnvValue(settings.brandSecondary as string),
    BRAND_LOGO_URL: sanitizeEnvValue(settings.brandLogoUrl as string),
    BRAND_EMOJI: sanitizeEnvValue(settings.emoji as string),
    NEXT_PUBLIC_APP_NAME: sanitizeEnvValue(settings.appName as string),
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      envMap.set(key, value);
    }
  }

  const existingKeys = new Set(entries.filter(e => e.type === 'kv').map(e => e.key));
  for (const [key, value] of Object.entries(updates)) {
    if (value && !existingKeys.has(key)) {
      entries.push({ type: 'kv', key, value });
      existingKeys.add(key);
    }
  }

  const newContent = entries
    .map(entry => {
      if (entry.type === 'comment') {
        return entry.text;
      }
      const updatedValue = envMap.get(entry.key);
      return `${entry.key}=${updatedValue ?? entry.value}`;
    })
    .join('\n');

  writeFileSync(envPath, newContent + '\n');
}

export async function POST(request: NextRequest) {
  try {
    const existingSettings = await getSettings();
    if (existingSettings?.onboarded) {
      return errorResponse('VALIDATION_ERROR', 'Onboarding already completed', 400);
    }

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
      `MONGODB_URI=${sanitizeEnvValue(apiKeys.mongodbUri) || ''}`,
      `CHAT_API_KEY=${sanitizeEnvValue(apiKeys.chatApiKey) || ''}`,
      sanitizeEnvValue(apiKeys.chatBaseUrl) ? `CHAT_BASE_URL=${sanitizeEnvValue(apiKeys.chatBaseUrl)}` : null,
      `CHAT_MODEL=${sanitizeEnvValue(apiKeys.chatModel) || process.env.CHAT_MODEL || 'llama-3.3-70b'}`,
      `EMBEDDING_API_KEY=${sanitizeEnvValue(apiKeys.embeddingApiKey) || ''}`,
      `TAVILY_API_KEY=${sanitizeEnvValue(apiKeys.tavilyApiKey) || ''}`,
      `ADMIN_TOKEN=${sanitizeEnvValue(apiKeys.adminSecret) || ''}`,
      `NEXT_PUBLIC_UNI_URL=${sanitizeEnvValue(universityUrl) || ''}`,
      `BRAND_PRIMARY=${sanitizeEnvValue(brandPrimary) || ''}`,
      sanitizeEnvValue(brandSecondary) ? `BRAND_SECONDARY=${sanitizeEnvValue(brandSecondary)}` : null,
      sanitizeEnvValue(logoUrl) ? `BRAND_LOGO_URL=${sanitizeEnvValue(logoUrl)}` : null,
      sanitizeEnvValue(emoji) ? `BRAND_EMOJI=${sanitizeEnvValue(emoji)}` : null,
      `NEXT_PUBLIC_APP_NAME=${sanitizeEnvValue(universityName) || ''}`,
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
