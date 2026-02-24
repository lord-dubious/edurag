import { getSettings, updateSettings } from '@/lib/db/settings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { LogoUpload } from '@/components/admin/LogoUpload';

async function saveSettings(formData: FormData) {
  'use server';
  
  const appName = formData.get('appName') as string;
  const brandPrimary = formData.get('brandPrimary') as string;
  const brandSecondary = formData.get('brandSecondary') as string;
  const brandLogoUrl = formData.get('brandLogoUrl') as string;
  const emoji = formData.get('emoji') as string;
  const iconType = formData.get('iconType') as 'logo' | 'emoji' | 'upload';
  
  const chatModel = formData.get('chatModel') as string;
  const chatMaxTokens = parseInt(formData.get('chatMaxTokens') as string) || 32000;
  const chatMaxSteps = Math.min(20, Math.max(1, parseInt(formData.get('chatMaxSteps') as string) || 5));
  
  const embeddingModel = formData.get('embeddingModel') as string;
  const embeddingDimensions = parseInt(formData.get('embeddingDimensions') as string) || 2048;
  
  const uploadthingSecret = formData.get('uploadthingSecret') as string;
  const uploadthingAppId = formData.get('uploadthingAppId') as string;
  
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
    },
    embeddingConfig: {
      model: embeddingModel,
      dimensions: embeddingDimensions,
    },
    uploadthingSecret: uploadthingSecret || undefined,
    uploadthingAppId: uploadthingAppId || undefined,
  });
  
  revalidatePath('/admin/settings');
}

export default async function AdminSettingsPage() {
  const settings = await getSettings();
  
  const appName = settings?.appName || 'University Knowledge Base';
  const brandPrimary = settings?.brandPrimary || '#3b82f6';
  const brandSecondary = settings?.brandSecondary || '#1e40af';
  const brandLogoUrl = settings?.brandLogoUrl || '';
  const emoji = settings?.emoji || '🎓';
  const iconType = settings?.iconType || 'emoji';
  
  const chatMaxTokens = settings?.chatConfig?.maxTokens || 32000;
  const chatMaxSteps = settings?.chatConfig?.maxSteps || 5;
  
  const embeddingModel = settings?.embeddingConfig?.model || 'voyage-4-large';
  const embeddingDimensions = settings?.embeddingConfig?.dimensions || 2048;
  
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
              Configure the AI models used for chat and embeddings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
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
            </div>
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
