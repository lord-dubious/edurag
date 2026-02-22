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
  embeddingApiKey: string;
  tavilyApiKey: string;
  adminSecret: string;
}

interface VoiceConfig {
  deepgramApiKey?: string;
  voiceTtsApiKey?: string;
  voiceTtsBaseUrl?: string;
  voiceTtsVoice?: string;
  voiceTtsModel?: string;
}

function maskSecret(value: string | undefined): string {
  if (!value || value.length <= 4) return '****';
  return '*'.repeat(value.length - 4) + value.slice(-4);
}

function sanitizeEnvValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/[\n\r]/g, '');
}

type EnvEntry = { type: 'comment'; text: string } | { type: 'kv'; key: string; value: string } | { type: 'blank' };

async function writeEnvFile(apiKeys: ApiKeys, voiceConfig: VoiceConfig, settings: Record<string, unknown>): Promise<{ success: boolean; skipped: boolean; error?: string }> {
  const isVercel = process.env.VERCEL === '1';
  if (isVercel) {
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
    EMBEDDING_API_KEY: sanitizeEnvValue(apiKeys.embeddingApiKey),
    TAVILY_API_KEY: sanitizeEnvValue(apiKeys.tavilyApiKey),
    ADMIN_TOKEN: sanitizeEnvValue(apiKeys.adminSecret),
    DEEPGRAM_API_KEY: sanitizeEnvValue(voiceConfig.deepgramApiKey),
    VOICE_TTS_API_KEY: sanitizeEnvValue(voiceConfig.voiceTtsApiKey),
    VOICE_TTS_BASE_URL: sanitizeEnvValue(voiceConfig.voiceTtsBaseUrl),
    VOICE_TTS_VOICE: sanitizeEnvValue(voiceConfig.voiceTtsVoice),
    VOICE_TTS_MODEL: sanitizeEnvValue(voiceConfig.voiceTtsModel),
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
      if (entry.type === 'blank') {
        return '';
      }
      const updatedValue = envMap.get(entry.key);
      return `${entry.key}=${updatedValue ?? entry.value}`;
    })
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
      voiceConfig,
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

    const writeResult = await writeEnvFile(apiKeys, voiceConfig || {}, settings);
    if (!writeResult.success && !writeResult.skipped) {
      console.error('Failed to write .env.local:', writeResult.error);
    }

    const envPreview = [
      `MONGODB_URI=${maskSecret(apiKeys.mongodbUri)}`,
      `CHAT_API_KEY=${maskSecret(apiKeys.chatApiKey)}`,
      sanitizeEnvValue(apiKeys.chatBaseUrl) ? `CHAT_BASE_URL=${sanitizeEnvValue(apiKeys.chatBaseUrl)}` : null,
      `CHAT_MODEL=${sanitizeEnvValue(apiKeys.chatModel) || process.env.CHAT_MODEL || 'llama-3.3-70b'}`,
      `EMBEDDING_API_KEY=${maskSecret(apiKeys.embeddingApiKey)}`,
      `TAVILY_API_KEY=${maskSecret(apiKeys.tavilyApiKey)}`,
      `ADMIN_TOKEN=${maskSecret(apiKeys.adminSecret)}`,
      sanitizeEnvValue(voiceConfig?.deepgramApiKey) ? `DEEPGRAM_API_KEY=${maskSecret(voiceConfig.deepgramApiKey)}` : null,
      sanitizeEnvValue(voiceConfig?.voiceTtsApiKey) ? `VOICE_TTS_API_KEY=${maskSecret(voiceConfig.voiceTtsApiKey)}` : null,
      sanitizeEnvValue(voiceConfig?.voiceTtsBaseUrl) ? `VOICE_TTS_BASE_URL=${sanitizeEnvValue(voiceConfig.voiceTtsBaseUrl)}` : null,
      sanitizeEnvValue(voiceConfig?.voiceTtsVoice) ? `VOICE_TTS_VOICE=${sanitizeEnvValue(voiceConfig.voiceTtsVoice)}` : null,
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
      envWritten: writeResult.success,
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
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
