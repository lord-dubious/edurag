import { NextRequest, NextResponse } from 'next/server';
import { access, readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { updateSettings, getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';
import { hasRequiredEnvVars } from '@/lib/env';

interface ApiKeys {
  mongodbUri: string;
  chatApiKey: string;
  chatBaseUrl: string;
  chatModel: string;
  chatMaxTokens: number;
  chatMaxSteps: number;
  chatTemperature: number;
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

function maskedPresence(value: string | undefined): string {
  return value ? '****' : '';
}

function sanitizeEnvValue(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  return value.replace(/[\n\r]/g, '');
}

function isMaskedPlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^\*+$/.test(value.trim());
}

function resolveApiKeyValue(value: string | undefined, envValue: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  if (!trimmedValue || isMaskedPlaceholder(trimmedValue)) {
    return envValue?.trim();
  }
  return trimmedValue;
}

type EnvEntry = { type: 'comment'; text: string } | { type: 'kv'; key: string; value: string } | { type: 'blank' };

/**
 * Update the project's .env.local file with provided onboarding API keys and related settings while preserving existing file comments and ordering.
 *
 * If running in production, test, Vercel, or Netlify environments, the operation is skipped.
 *
 * @param apiKeys - Onboarding-provided API keys and numeric parameters to write into the environment file (e.g., database, chat, embedding, Tavily, Uploadthing, admin secret, and chat tuning values).
 * @param settings - Onboarding settings; `uniUrl` is written to `UNIVERSITY_URL` when present.
 * @returns An object describing the result:
 *  - `success`: `true` if the file was written successfully, `false` otherwise.
 *  - `skipped`: `true` if the write was intentionally skipped due to environment, `false` otherwise.
 *  - `error` (optional): stringified error message when `success` is `false` and the operation failed due to a filesystem error.
 */
async function writeEnvFile(apiKeys: ApiKeys, settings: Record<string, unknown>): Promise<{ success: boolean; skipped: boolean; error?: string }> {
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test';
  const isVercel = process.env.VERCEL === '1';
  const isNetlify = process.env.NETLIFY === 'true';

  if (isProduction || isTest || isVercel || isNetlify) {
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
    CHAT_TEMPERATURE: apiKeys.chatTemperature != null ? String(apiKeys.chatTemperature) : undefined,
    EMBEDDING_API_KEY: sanitizeEnvValue(apiKeys.embeddingApiKey),
    EMBEDDING_MODEL: sanitizeEnvValue(apiKeys.embeddingModel),
    EMBEDDING_DIMENSIONS: apiKeys.embeddingDimensions != null ? String(apiKeys.embeddingDimensions) : undefined,
    TAVILY_API_KEY: sanitizeEnvValue(apiKeys.tavilyApiKey),
    UPLOADTHING_SECRET: sanitizeEnvValue(apiKeys.uploadthingSecret),
    UPLOADTHING_APP_ID: sanitizeEnvValue(apiKeys.uploadthingAppId),
    ADMIN_SECRET: sanitizeEnvValue(apiKeys.adminSecret),
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

/**
 * Complete onboarding by validating input, saving settings, optionally persisting environment variables, and returning a masked preview of resulting env values.
 *
 * Expects the request body to contain onboarding fields (e.g., `universityUrl`, `brandPrimary`, branding and UI options, `apiKeys`, `crawlConfig`, etc.). If required environment values are missing, `apiKeys` must include the necessary secrets and configuration values (MongoDB URI, chat/embedding/tavily API keys, admin secret, embedding model and dimensions).
 *
 * @param request - The incoming NextRequest whose JSON body contains onboarding configuration and optional `apiKeys`.
 * @returns A Response with JSON { success, envPreview, isProduction, envWritten } where:
 *  - `envPreview` is a newline-separated, masked preview of effective env key/value pairs,
 *  - `isProduction` reflects NODE_ENV === 'production',
 *  - `envWritten` is true when the handler wrote a new .env.local (i.e., required env vars were not already present).
 * The response also sets an `edurag_onboarded=true` cookie on success.
 */
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

    const hasAllEnvVars = hasRequiredEnvVars();
    const resolvedApiKeys = apiKeys
      ? {
        ...apiKeys,
        mongodbUri: resolveApiKeyValue(apiKeys.mongodbUri, process.env.MONGODB_URI) || '',
        chatApiKey: resolveApiKeyValue(apiKeys.chatApiKey, process.env.CHAT_API_KEY) || '',
        embeddingApiKey: resolveApiKeyValue(apiKeys.embeddingApiKey, process.env.EMBEDDING_API_KEY) || '',
        tavilyApiKey: resolveApiKeyValue(apiKeys.tavilyApiKey, process.env.TAVILY_API_KEY) || '',
        adminSecret: resolveApiKeyValue(apiKeys.adminSecret, process.env.ADMIN_SECRET) || '',
      }
      : undefined;

    if (!hasAllEnvVars) {
      if (!resolvedApiKeys?.mongodbUri) {
        return errorResponse('VALIDATION_ERROR', 'MongoDB connection string is required', 400);
      }
      if (!resolvedApiKeys?.chatApiKey) {
        return errorResponse('VALIDATION_ERROR', 'Chat API key is required', 400);
      }
      if (!resolvedApiKeys?.embeddingApiKey) {
        return errorResponse('VALIDATION_ERROR', 'Embedding API key is required', 400);
      }
      if (!resolvedApiKeys?.tavilyApiKey) {
        return errorResponse('VALIDATION_ERROR', 'Tavily API key is required', 400);
      }
      if (!resolvedApiKeys?.adminSecret) {
        return errorResponse('VALIDATION_ERROR', 'Admin secret is required', 400);
      }
      if (!resolvedApiKeys?.embeddingModel) {
        return errorResponse('VALIDATION_ERROR', 'Embedding model is required', 400);
      }
      const dim = Number(resolvedApiKeys?.embeddingDimensions);
      if (!Number.isInteger(dim) || dim <= 0) {
        return errorResponse('VALIDATION_ERROR', 'Embedding dimensions must be a positive integer', 400);
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

    if (resolvedApiKeys && !hasAllEnvVars) {
      const writeResult = await writeEnvFile(resolvedApiKeys, settings);
      if (!writeResult.success && !writeResult.skipped) {
        console.error('Failed to write .env.local:', writeResult.error);
        return errorResponse('INTERNAL_ERROR', 'Failed to save environment variables', 500);
      }
    }

    const envPreview = [
      `MONGODB_URI=${maskSecret(resolvedApiKeys?.mongodbUri || process.env.MONGODB_URI)}`,
      `CHAT_API_KEY=${maskSecret(resolvedApiKeys?.chatApiKey || process.env.CHAT_API_KEY)}`,
      resolvedApiKeys?.chatBaseUrl || process.env.CHAT_BASE_URL ? `CHAT_BASE_URL=${sanitizeEnvValue(resolvedApiKeys?.chatBaseUrl || process.env.CHAT_BASE_URL)}` : null,
      `CHAT_MODEL=${sanitizeEnvValue(resolvedApiKeys?.chatModel) || process.env.CHAT_MODEL || 'gpt-oss-120b'}`,
      `CHAT_MAX_TOKENS=${resolvedApiKeys?.chatMaxTokens ?? process.env.CHAT_MAX_TOKENS ?? 32000}`,
      `CHAT_MAX_STEPS=${resolvedApiKeys?.chatMaxSteps ?? process.env.CHAT_MAX_STEPS ?? 5}`,
      `CHAT_TEMPERATURE=${resolvedApiKeys?.chatTemperature ?? process.env.CHAT_TEMPERATURE ?? 0.2}`,
      `EMBEDDING_API_KEY=${maskSecret(resolvedApiKeys?.embeddingApiKey || process.env.EMBEDDING_API_KEY)}`,
      `EMBEDDING_MODEL=${resolvedApiKeys?.embeddingModel || process.env.EMBEDDING_MODEL || 'voyage-4-large'}`,
      `EMBEDDING_DIMENSIONS=${resolvedApiKeys?.embeddingDimensions || process.env.EMBEDDING_DIMENSIONS || 2048}`,
      `TAVILY_API_KEY=${maskSecret(resolvedApiKeys?.tavilyApiKey || process.env.TAVILY_API_KEY)}`,
      `ADMIN_SECRET=${maskSecret(resolvedApiKeys?.adminSecret || process.env.ADMIN_SECRET)}`,
      `UNIVERSITY_URL=${sanitizeEnvValue(universityUrl) || ''}`,
    ].filter(Boolean).join('\n');

    const response = NextResponse.json({
      success: true,
      envPreview,
      isProduction: process.env.NODE_ENV === 'production',
      envWritten: !hasAllEnvVars,
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

/**
 * Provide onboarding status, selected saved settings, environment-variable availability, and masked API key presence.
 *
 * @returns A JSON HTTP `Response` whose body contains:
 * - `isOnboarded`: `true` if onboarding has been completed, `false` otherwise.
 * - `uniUrl`, `brandPrimary`, `brandSecondary`, `logoUrl`, `emoji`, `iconType`, `showTitle`, `appName`: selected stored settings (may be `undefined` if unset).
 * - `hasAllEnvVars`: `true` if all required environment variables are present, `false` otherwise.
 * - `apiKeys`: an object with non-secret config values plus masked presence indicators (`'****'` or `''`) for secrets:
 *   - `mongodbUri`, `chatApiKey`, `chatBaseUrl`, `chatModel`, `chatMaxTokens`, `chatMaxSteps`, `chatTemperature`,
 *     `embeddingApiKey`, `embeddingModel`, `embeddingDimensions`, `tavilyApiKey`.
 *   - `adminSecret`: set to `'****'` when `ADMIN_SECRET` is present, otherwise `''`.
 */
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
      hasAllEnvVars: hasRequiredEnvVars(),
      apiKeys: {
        mongodbUri: maskedPresence(process.env.MONGODB_URI),
        chatApiKey: maskedPresence(process.env.CHAT_API_KEY),
        chatBaseUrl: process.env.CHAT_BASE_URL || '',
        chatModel: process.env.CHAT_MODEL || '',
        chatMaxTokens: process.env.CHAT_MAX_TOKENS || '',
        chatMaxSteps: process.env.CHAT_MAX_STEPS || '',
        chatTemperature: process.env.CHAT_TEMPERATURE || '',
        embeddingApiKey: maskedPresence(process.env.EMBEDDING_API_KEY),
        embeddingModel: process.env.EMBEDDING_MODEL || '',
        embeddingDimensions: process.env.EMBEDDING_DIMENSIONS || '',
        tavilyApiKey: maskedPresence(process.env.TAVILY_API_KEY),
        adminSecret: maskedPresence(process.env.ADMIN_SECRET),
      },
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
