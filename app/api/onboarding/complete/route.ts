import { NextRequest, NextResponse } from 'next/server';
import { access, readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { updateSettings, getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';

interface ApiKeys {
  mongodbUri: string;
  chatApiKey: string;
  chatBaseUrl: string;
  chatModel: string;
  chatMaxTokens: number;
  chatMaxSteps: number;
  embeddingApiKey: string;
  embeddingModel: string;
  embeddingDimensions: number;
  tavilyApiKey: string;
  uploadthingSecret: string;
  uploadthingAppId: string;
  adminSecret: string;
}

function maskSecret(value: string | undefined): string {
  if (!value || value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

function sanitizeEnvValue(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value.replace(/[\n\r]/g, '');
}

type EnvEntry = { type: 'comment'; text: string } | { type: 'kv'; key: string; value: string } | { type: 'blank' };

async function writeEnvFile(apiKeys: ApiKeys, settings: Record<string, unknown>): Promise<{ success: boolean; skipped: boolean; error?: string }> {
  const isProduction = process.env.NODE_ENV === 'production';
  const isVercel = process.env.VERCEL === '1';
  const isNetlify = process.env.NETLIFY === 'true';
  
  if (isProduction || isVercel || isNetlify) {
    return { success: false, skipped: true };
  }

  const envPath = path.join(process.cwd(), '.env.local');

  let existingEnv = '';
  try {
    await access(envPath);
    existingEnv = await readFile(envPath, 'utf-8');
  } catch {
    // File doesn't exist, that's fine
  }

  const lines = existingEnv.split('\n');
  const entries: EnvEntry[] = [];
  const envMap = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      entries.push({ type: 'blank' });
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
    CHAT_MAX_TOKENS: apiKeys.chatMaxTokens != null ? String(apiKeys.chatMaxTokens) : undefined,
    CHAT_MAX_STEPS: apiKeys.chatMaxSteps != null ? String(apiKeys.chatMaxSteps) : undefined,
    EMBEDDING_API_KEY: sanitizeEnvValue(apiKeys.embeddingApiKey),
    EMBEDDING_MODEL: sanitizeEnvValue(apiKeys.embeddingModel),
    EMBEDDING_DIMENSIONS: apiKeys.embeddingDimensions ? String(apiKeys.embeddingDimensions) : undefined,
    TAVILY_API_KEY: sanitizeEnvValue(apiKeys.tavilyApiKey),
    UPLOADTHING_SECRET: sanitizeEnvValue(apiKeys.uploadthingSecret),
    UPLOADTHING_APP_ID: sanitizeEnvValue(apiKeys.uploadthingAppId),
    ADMIN_TOKEN: sanitizeEnvValue(apiKeys.adminSecret),
    UNIVERSITY_URL: sanitizeEnvValue(settings.uniUrl as string),
  };

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      envMap.set(key, value);
    }
  }

  const existingKeys = new Set(entries.filter(e => e.type === 'kv').map(e => e.key));
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== '' && !existingKeys.has(key)) {
      entries.push({ type: 'kv', key, value });
      existingKeys.add(key);
    }
  }

  const newContent = entries
    .map(entry => {
      if (entry.type === 'comment') {
        return entry.text;
      }
      if (entry.type === 'blank') {
        return '';
      }
      const updatedValue = envMap.get(entry.key);
      if (updatedValue === '') return null;
      return `${entry.key}=${updatedValue ?? entry.value}`;
    })
    .filter(line => line !== null)
    .join('\n');

  try {
    const envDir = path.dirname(envPath);
    await mkdir(envDir, { recursive: true });
    await writeFile(envPath, newContent + '\n');
    return { success: true, skipped: false };
  } catch (err) {
    return { success: false, skipped: false, error: String(err) };
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const existingSettings = await getSettings();
    if (existingSettings?.onboarded) {
      return errorResponse('FORBIDDEN', 'Onboarding already completed', 403);
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

    const hasAllEnvVars = !!(
      process.env.MONGODB_URI &&
      process.env.CHAT_API_KEY &&
      process.env.EMBEDDING_API_KEY &&
      process.env.TAVILY_API_KEY &&
      process.env.ADMIN_SECRET
    );

    if (!hasAllEnvVars) {
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
      if (!apiKeys?.embeddingModel) {
        return errorResponse('VALIDATION_ERROR', 'Embedding model is required', 400);
      }
      if (!apiKeys?.embeddingDimensions) {
        return errorResponse('VALIDATION_ERROR', 'Embedding dimensions is required', 400);
      }
    }

    const settings = {
      onboarded: true,
      uniUrl: universityUrl,
      appName: universityName || 'University Knowledge Base',
      brandPrimary: brandPrimary,
      brandSecondary: brandSecondary || brandPrimary,
      brandLogoUrl: (iconType === 'logo' || iconType === 'upload') ? logoUrl : '',
      emoji: iconType === 'emoji' ? emoji : '',
      iconType: iconType || 'emoji',
      showTitle: showTitle !== false,
      externalUrls: externalUrls || [],
      excludePaths: excludePaths || [],
      crawlConfig: crawlConfig || { maxDepth: 3, maxBreadth: 50, limit: 300 },
      fileTypeRules: fileTypeRules || { pdf: 'index', docx: 'index', csv: 'skip' },
    };

    await updateSettings(settings);

    if (apiKeys && !hasAllEnvVars) {
      const writeResult = await writeEnvFile(apiKeys, settings);
      if (!writeResult.success && !writeResult.skipped) {
        console.error('Failed to write .env.local:', writeResult.error);
      }
    }

    const envPreview = [
      `MONGODB_URI=${maskSecret(apiKeys?.mongodbUri || process.env.MONGODB_URI)}`,
      `CHAT_API_KEY=${maskSecret(apiKeys?.chatApiKey || process.env.CHAT_API_KEY)}`,
      apiKeys?.chatBaseUrl || process.env.CHAT_BASE_URL ? `CHAT_BASE_URL=${sanitizeEnvValue(apiKeys?.chatBaseUrl || process.env.CHAT_BASE_URL)}` : null,
      `CHAT_MODEL=${sanitizeEnvValue(apiKeys?.chatModel) || process.env.CHAT_MODEL || 'gpt-oss-120b'}`,
      `EMBEDDING_API_KEY=${maskSecret(apiKeys?.embeddingApiKey || process.env.EMBEDDING_API_KEY)}`,
      `EMBEDDING_MODEL=${apiKeys?.embeddingModel || process.env.EMBEDDING_MODEL || 'voyage-4-large'}`,
      `EMBEDDING_DIMENSIONS=${apiKeys?.embeddingDimensions || process.env.EMBEDDING_DIMENSIONS || 2048}`,
      `TAVILY_API_KEY=${maskSecret(apiKeys?.tavilyApiKey || process.env.TAVILY_API_KEY)}`,
      `ADMIN_TOKEN=${maskSecret(apiKeys?.adminSecret || process.env.ADMIN_TOKEN)}`,
      `UNIVERSITY_URL=${sanitizeEnvValue(universityUrl) || ''}`,
    ].filter(Boolean).join('\n');

    const response = NextResponse.json({
      success: true,
      envPreview,
      isProduction: process.env.NODE_ENV === 'production',
      envWritten: hasAllEnvVars ? false : true,
    });
    response.cookies.set('edurag_onboarded', 'true', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
    return response;
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to save onboarding config', 500, error);
  }
}

export async function GET(): Promise<Response> {
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
      hasAllEnvVars: !!(
        process.env.MONGODB_URI &&
        process.env.CHAT_API_KEY &&
        process.env.EMBEDDING_API_KEY &&
        process.env.TAVILY_API_KEY &&
        process.env.ADMIN_SECRET
      ),
      apiKeys: {
        mongodbUri: process.env.MONGODB_URI || '',
        chatApiKey: process.env.CHAT_API_KEY || '',
        chatBaseUrl: process.env.CHAT_BASE_URL || '',
        chatModel: process.env.CHAT_MODEL || '',
        embeddingApiKey: process.env.EMBEDDING_API_KEY || '',
        embeddingModel: process.env.EMBEDDING_MODEL || '',
        embeddingDimensions: process.env.EMBEDDING_DIMENSIONS || '',
        tavilyApiKey: process.env.TAVILY_API_KEY || '',
        adminSecret: process.env.ADMIN_TOKEN ? '****' : '',
      },
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
