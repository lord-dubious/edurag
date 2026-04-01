import { getSettings, updateSettings } from '@/lib/db/settings';
import { requireAdmin } from '@/lib/admin-guard';
import { env } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { LogoUpload } from '@/components/admin/LogoUpload';
import { Badge } from '@/components/ui/badge';

/**
 * Process admin settings form submission, persist the updated configuration, and revalidate the admin settings page.
 *
 * Reads branding, AI model, embeddings, reranking, Tavily, Deepgram (voice), and Uploadthing fields from `formData`,
 * parsing and clamping numeric values where applicable (for example: `chatTemperature` clamped to [0, 2], `chatMaxSteps`
 * clamped to [1, 20], `rerankTopK` clamped to [1, 20]). Blank string fields are persisted as `undefined`. Administrative
 * access is required before making changes.
 *
 * @param formData - FormData from the admin settings form containing fields such as `appName`, `brandPrimary`, `brandSecondary`,
 *   `iconType`, `chatModel`, `chatBaseUrl`, `chatApiKey`, `chatMaxTokens`, `chatMaxSteps`, `chatTemperature`,
 *   `embeddingModel`, `embeddingDimensions`, `embeddingApiKey`, `rerankModel`, `rerankTopK`, `tavilyApiKey`,
 *   `deepgramApiKey`, `deepgramTokenTtl`, `deepgramSttModel`, `deepgramTtsModel`, `deepgramThinkModel`,
 *   `uploadthingSecret`, and `uploadthingAppId`.
 */
async function saveSettings(formData: FormData) {
  'use server';

  await requireAdmin();
  const existing = await getSettings();

  const appName = formData.get('appName') as string;
  const brandPrimary = formData.get('brandPrimary') as string;
  const brandSecondary = formData.get('brandSecondary') as string;
  const brandLogoUrl = formData.get('brandLogoUrl') as string;
  const emoji = formData.get('emoji') as string;
  const iconType = formData.get('iconType') as 'logo' | 'emoji' | 'upload';

  const chatMaxTokens = parseInt(formData.get('chatMaxTokens') as string) || 32000;
  const chatMaxSteps = Math.min(20, Math.max(1, parseInt(formData.get('chatMaxSteps') as string) || 5));
  const parsedChatTemperature = parseFloat(formData.get('chatTemperature') as string);
  const chatTemperature = Number.isFinite(parsedChatTemperature)
    ? Math.min(2, Math.max(0, parsedChatTemperature))
    : existing?.chatConfig?.temperature ?? env.CHAT_TEMPERATURE;
  const chatModel = (formData.get('chatModel') as string).trim();
  const chatBaseUrl = (formData.get('chatBaseUrl') as string).trim();
  const chatApiKeyInput = formData.get('chatApiKey') as string;
  const chatApiKey = chatApiKeyInput || existing?.chatConfig?.apiKey;

  const embeddingModel = (formData.get('embeddingModel') as string).trim();
  const embeddingDimensions = parseInt(formData.get('embeddingDimensions') as string) || 2048;
  const embeddingApiKeyInput = formData.get('embeddingApiKey') as string;
  const embeddingApiKey = embeddingApiKeyInput || existing?.embeddingConfig?.apiKey;

  const rerankModel = (formData.get('rerankModel') as string).trim();
  const rerankTopK = Math.min(20, Math.max(1, parseInt(formData.get('rerankTopK') as string) || 6));

  const tavilyApiKeyInput = formData.get('tavilyApiKey') as string;
  const tavilyApiKey = tavilyApiKeyInput || existing?.tavilyApiKey;

  const deepgramApiKeyInput = formData.get('deepgramApiKey') as string;
  const deepgramApiKey = deepgramApiKeyInput || existing?.voiceConfig?.apiKey;
  const deepgramTokenTtl = parseInt(formData.get('deepgramTokenTtl') as string) || env.DEEPGRAM_TOKEN_TTL;
  const deepgramSttModel = (formData.get('deepgramSttModel') as string).trim();
  const deepgramTtsModel = (formData.get('deepgramTtsModel') as string).trim();
  const deepgramThinkModel = (formData.get('deepgramThinkModel') as string).trim();

  const uploadthingSecretInput = formData.get('uploadthingSecret') as string;
  const uploadthingSecret = uploadthingSecretInput || existing?.uploadthingSecret;
  const uploadthingAppIdInput = formData.get('uploadthingAppId') as string;
  const uploadthingAppId = uploadthingAppIdInput || existing?.uploadthingAppId;

  await updateSettings({
    appName,
    brandPrimary,
    brandSecondary,
    brandLogoUrl: brandLogoUrl || undefined,
    emoji: emoji || undefined,
    iconType,
    chatConfig: {
      maxTokens: chatMaxTokens,
      maxSteps: chatMaxSteps,
      temperature: chatTemperature,
      model: chatModel || undefined,
      baseUrl: chatBaseUrl || undefined,
      apiKey: chatApiKey || undefined,
    },
    embeddingConfig: {
      model: embeddingModel || undefined,
      dimensions: embeddingDimensions,
      apiKey: embeddingApiKey || undefined,
    },
    rerankConfig: {
      model: rerankModel || undefined,
      topK: rerankTopK,
    },
    tavilyApiKey: tavilyApiKey || undefined,
    voiceConfig: {
      apiKey: deepgramApiKey || undefined,
      tokenTtl: deepgramTokenTtl,
      sttModel: deepgramSttModel || undefined,
      ttsModel: deepgramTtsModel || undefined,
      thinkModel: deepgramThinkModel || undefined,
    },
    uploadthingSecret: uploadthingSecret || undefined,
    uploadthingAppId: uploadthingAppId || undefined,
  });

  revalidatePath('/admin/settings');
}

/**
 * Render the admin settings page for configuring site appearance, AI models, and service credentials.
 *
 * Loads persisted settings (requires admin access), derives UI defaults (falling back to environment values),
 * and returns a form that allows updating branding, chat/embedding/reranking models, Tavily, Deepgram, and Uploadthing settings.
 *
 * @returns A JSX element containing the admin settings form and system status overview.
 */
export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSettings();

  const appName = settings?.appName || 'University Knowledge Base';
  const brandPrimary = settings?.brandPrimary || '#3b82f6';
  const brandSecondary = settings?.brandSecondary || '#1e40af';
  const brandLogoUrl = settings?.brandLogoUrl || '';
  const emoji = settings?.emoji || '🎓';
  const iconType = settings?.iconType || 'emoji';

  const chatMaxTokens = settings?.chatConfig?.maxTokens || env.CHAT_MAX_TOKENS;
  const chatMaxSteps = settings?.chatConfig?.maxSteps || env.CHAT_MAX_STEPS;
  const chatTemperature = settings?.chatConfig?.temperature ?? env.CHAT_TEMPERATURE;
  const chatModel = settings?.chatConfig?.model || env.CHAT_MODEL;
  const chatBaseUrl = settings?.chatConfig?.baseUrl || env.CHAT_BASE_URL || '';
  const hasChatKeyInSettings = Boolean(settings?.chatConfig?.apiKey);
  const hasChatKeyInEnv = Boolean(env.CHAT_API_KEY);
  const chatKeyPlaceholder = hasChatKeyInSettings
    ? '•••••••• (saved)'
    : hasChatKeyInEnv
      ? '•••••••• (env)'
      : 'not configured';

  const embeddingModel = settings?.embeddingConfig?.model || env.EMBEDDING_MODEL;
  const embeddingDimensions = settings?.embeddingConfig?.dimensions || env.EMBEDDING_DIMENSIONS;
  const hasEmbeddingKeyInSettings = Boolean(settings?.embeddingConfig?.apiKey);
  const hasEmbeddingKeyInEnv = Boolean(env.EMBEDDING_API_KEY);
  const embeddingKeyPlaceholder = hasEmbeddingKeyInSettings
    ? '•••••••• (saved)'
    : hasEmbeddingKeyInEnv
      ? '•••••••• (env)'
      : 'not configured';

  const rerankModel = settings?.rerankConfig?.model || env.RERANK_MODEL;
  const rerankTopK = settings?.rerankConfig?.topK || env.RERANK_TOP_K;
  const hasTavilyKeyInSettings = Boolean(settings?.tavilyApiKey);
  const hasTavilyKeyInEnv = Boolean(env.TAVILY_API_KEY);
  const tavilyKeyPlaceholder = hasTavilyKeyInSettings
    ? '•••••••• (saved)'
    : hasTavilyKeyInEnv
      ? '•••••••• (env)'
      : 'not configured';

  const deepgramTokenTtl = settings?.voiceConfig?.tokenTtl || env.DEEPGRAM_TOKEN_TTL;
  const deepgramSttModel = settings?.voiceConfig?.sttModel || env.DEEPGRAM_STT_MODEL;
  const deepgramTtsModel = settings?.voiceConfig?.ttsModel || env.DEEPGRAM_TTS_MODEL;
  const deepgramThinkModel = settings?.voiceConfig?.thinkModel || env.DEEPGRAM_THINK_MODEL;
  const hasDeepgramKeyInSettings = Boolean(settings?.voiceConfig?.apiKey);
  const hasDeepgramKeyInEnv = Boolean(env.DEEPGRAM_API_KEY);
  const deepgramKeyPlaceholder = hasDeepgramKeyInSettings
    ? '•••••••• (saved)'
    : hasDeepgramKeyInEnv
      ? '•••••••• (env)'
      : 'not configured';
  const statusItems = [
    { label: 'Database', ok: Boolean(env.MONGODB_URI) },
    { label: 'Admin Secret', ok: Boolean(env.ADMIN_SECRET) },
    { label: 'Chat API Key', ok: hasChatKeyInSettings || hasChatKeyInEnv },
    { label: 'Embedding API Key', ok: hasEmbeddingKeyInSettings || hasEmbeddingKeyInEnv },
    { label: 'Tavily API Key', ok: hasTavilyKeyInSettings || hasTavilyKeyInEnv },
    { label: 'Deepgram API Key', ok: hasDeepgramKeyInSettings || hasDeepgramKeyInEnv },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure your knowledge base appearance and AI models
        </p>
      </div>

      <form action={saveSettings} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>System Status</CardTitle>
            <CardDescription>
              Current environment readiness and key configuration sources
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {statusItems.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <Badge variant={item.ok ? 'default' : 'destructive'}>
                  {item.ok ? 'Ready' : 'Missing'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Brand</CardTitle>
            <CardDescription>
              Customize the appearance of your knowledge base
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="appName">App Name</Label>
              <Input
                id="appName"
                name="appName"
                defaultValue={appName}
                placeholder="University Knowledge Base"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brandPrimary">Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="brandPrimary"
                    name="brandPrimary"
                    type="color"
                    defaultValue={brandPrimary}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    name="brandPrimaryHex"
                    value={brandPrimary}
                    className="font-mono"
                    readOnly
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="brandSecondary">Secondary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="brandSecondary"
                    name="brandSecondary"
                    type="color"
                    defaultValue={brandSecondary}
                    className="w-12 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    name="brandSecondaryHex"
                    value={brandSecondary}
                    className="font-mono"
                    readOnly
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="iconType">Icon Type</Label>
              <select
                id="iconType"
                name="iconType"
                defaultValue={iconType}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="emoji">Emoji</option>
                <option value="logo">Logo</option>
              </select>
            </div>
            {iconType === 'emoji' ? (
              <div className="space-y-2">
                <Label htmlFor="emoji">Emoji</Label>
                <Input
                  id="emoji"
                  name="emoji"
                  defaultValue={emoji}
                  placeholder="🎓"
                  className="text-2xl text-center"
                />
              </div>
            ) : (
              <LogoUpload defaultUrl={brandLogoUrl} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Models</CardTitle>
            <CardDescription>
              Configure the AI models used for chat, embeddings, and reranking
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Chat</div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="chatMaxTokens">Max Output Tokens</Label>
                <Input
                  id="chatMaxTokens"
                  name="chatMaxTokens"
                  type="number"
                  min={1000}
                  max={128000}
                  defaultValue={chatMaxTokens}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum response length
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chatMaxSteps">Max Agent Steps</Label>
                <Input
                  id="chatMaxSteps"
                  name="chatMaxSteps"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={chatMaxSteps}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum tool calls per response
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chatTemperature">Temperature</Label>
                <Input
                  id="chatTemperature"
                  name="chatTemperature"
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  defaultValue={chatTemperature}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  0 is deterministic, higher values are more creative
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="chatModel">Chat Model</Label>
                <Input
                  id="chatModel"
                  name="chatModel"
                  defaultValue={chatModel}
                  placeholder="gpt-oss-120b"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chatBaseUrl">Chat Base URL</Label>
                <Input
                  id="chatBaseUrl"
                  name="chatBaseUrl"
                  defaultValue={chatBaseUrl}
                  placeholder="https://api.openai.com/v1"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use the default provider URL
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chatApiKey">Chat API Key</Label>
              <Input
                id="chatApiKey"
                name="chatApiKey"
                type="password"
                placeholder={chatKeyPlaceholder}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the current key (saved or env)
              </p>
            </div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Embeddings</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="embeddingModel">Embedding Model</Label>
                <Input
                  id="embeddingModel"
                  name="embeddingModel"
                  defaultValue={embeddingModel}
                  placeholder="voyage-4-large"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="embeddingDimensions">Embedding Dimensions</Label>
                <Input
                  id="embeddingDimensions"
                  name="embeddingDimensions"
                  type="number"
                  step="256"
                  min={256}
                  max={2048}
                  defaultValue={embeddingDimensions}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  256, 512, 1024, or 2048
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="embeddingApiKey">Embedding API Key</Label>
              <Input
                id="embeddingApiKey"
                name="embeddingApiKey"
                type="password"
                placeholder={embeddingKeyPlaceholder}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the current key (saved or env)
              </p>
            </div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground pt-2">Reranking</div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rerankModel">Reranking Model</Label>
                <Input
                  id="rerankModel"
                  name="rerankModel"
                  defaultValue={rerankModel}
                  placeholder="rerank-2.5"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Voyage AI reranker for search precision
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rerankTopK">Rerank Top K</Label>
                <Input
                  id="rerankTopK"
                  name="rerankTopK"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={rerankTopK}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Number of results after reranking
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Crawler (Tavily)</CardTitle>
            <CardDescription>
              API access for crawling and indexing content
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="tavilyApiKey">Tavily API Key</Label>
            <Input
              id="tavilyApiKey"
              name="tavilyApiKey"
              type="password"
              placeholder={tavilyKeyPlaceholder}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to keep the current key (saved or env)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Voice (Deepgram)</CardTitle>
            <CardDescription>
              Configure speech models and credentials for voice chat
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="deepgramApiKey">Deepgram API Key</Label>
              <Input
                id="deepgramApiKey"
                name="deepgramApiKey"
                type="password"
                placeholder={deepgramKeyPlaceholder}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to keep the current key (saved or env)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deepgramTokenTtl">Token TTL (seconds)</Label>
                <Input
                  id="deepgramTokenTtl"
                  name="deepgramTokenTtl"
                  type="number"
                  min={30}
                  max={3600}
                  defaultValue={deepgramTokenTtl}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deepgramThinkModel">Think Model</Label>
                <Input
                  id="deepgramThinkModel"
                  name="deepgramThinkModel"
                  defaultValue={deepgramThinkModel}
                  placeholder="gemini-2.5-flash"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="deepgramSttModel">STT Model</Label>
                <Input
                  id="deepgramSttModel"
                  name="deepgramSttModel"
                  defaultValue={deepgramSttModel}
                  placeholder="nova-3"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deepgramTtsModel">TTS Model</Label>
                <Input
                  id="deepgramTtsModel"
                  name="deepgramTtsModel"
                  defaultValue={deepgramTtsModel}
                  placeholder="aura-2-thalia-en"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uploadthing (Optional)</CardTitle>
            <CardDescription>
              Cloud storage for logo uploads on Vercel/Netlify
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="uploadthingSecret">Uploadthing Secret</Label>
                <Input
                  id="uploadthingSecret"
                  name="uploadthingSecret"
                  type="password"
                  placeholder="sk_live_..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">From uploadthing.com dashboard</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="uploadthingAppId">Uploadthing App ID</Label>
                <Input
                  id="uploadthingAppId"
                  name="uploadthingAppId"
                  placeholder="abc123..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Free tier: 500MB storage</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit">
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
