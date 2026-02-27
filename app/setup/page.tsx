'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast, Toaster } from 'sonner';
import { Check, X, Shield, Loader2, Palette, ImageUp, Smile, Upload, Eye, EyeOff } from 'lucide-react';
import { ColorPicker } from '@/components/ui/color-picker';
import { DEFAULT_CRAWL_INSTRUCTIONS } from '@/lib/constants';

interface BrandData {
  universityName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  iconType: 'logo' | 'emoji' | 'upload';
  emoji: string;
  uploadedFileName?: string;
  showTitle: boolean;
}

type CrawlPhase = 'preparing' | 'crawling' | 'chunking' | 'embedding' | 'storing' | 'complete' | 'error';

interface CrawlProgress {
  phase: CrawlPhase;
  message: string;
  pagesFound: number;
  pagesProcessed: number;
  chunksCreated: number;
  docsStored: number;
  currentUrl?: string;
  error?: string;
}

interface CrawlLogEntry {
  timestamp: string;
  phase: CrawlPhase;
  message: string;
  url?: string;
}

interface FileTypeRules {
  pdf: 'index' | 'skip';
  docx: 'index' | 'skip';
  csv: 'index' | 'skip';
}

interface CrawlConfig {
  maxDepth: number;
  maxBreadth: number;
  limit: number;
  extractDepth: 'basic' | 'advanced';
}

const STEPS = [
  { label: 'University URL', short: 'URL' },
  { label: 'Branding', short: 'Brand' },
  { label: 'Crawl Scope', short: 'Scope' },
  { label: 'API Keys', short: 'Keys' },
  { label: 'Crawling', short: 'Crawl' },
  { label: 'Review', short: 'Review' },
] as const;

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

const PRESET_COLORS = [
  { name: 'Blue', primary: '#2563eb', secondary: '#1e40af' },
  { name: 'Green', primary: '#16a34a', secondary: '#15803d' },
  { name: 'Red', primary: '#dc2626', secondary: '#b91c1c' },
  { name: 'Purple', primary: '#9333ea', secondary: '#7e22ce' },
  { name: 'Orange', primary: '#ea580c', secondary: '#c2410c' },
  { name: 'Teal', primary: '#0d9488', secondary: '#0f766e' },
  { name: 'Pink', primary: '#db2777', secondary: '#be185d' },
  { name: 'Indigo', primary: '#4f46e5', secondary: '#4338ca' },
  { name: 'Yellow', primary: '#ca8a04', secondary: '#a16207' },
  { name: 'Slate', primary: '#475569', secondary: '#334155' },
];

import dynamic from 'next/dynamic';

const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false });


function isMaskedPlaceholder(value: string): boolean {
  return /^\*+$/.test(value.trim());
}

function mergeApiKeys(prev: ApiKeys, next: Partial<ApiKeys>): ApiKeys {
  const merged = { ...prev, ...next };
  if (next.adminSecret && isMaskedPlaceholder(next.adminSecret)) {
    merged.adminSecret = prev.adminSecret;
  }
  return merged;
}

interface PasswordInputProps {
  id: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

const PasswordInput = ({ id, placeholder, value, onChange, className }: PasswordInputProps) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
};

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  const [universityUrl, setUniversityUrl] = useState('');
  const [brandData, setBrandData] = useState<BrandData>({
    universityName: '',
    logoUrl: '',
    faviconUrl: '',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    iconType: 'emoji',
    emoji: '🎓',
    showTitle: true,
  });
  const [externalUrls, setExternalUrls] = useState<Array<{ url: string; label: string }>>([]);
  const [excludePaths, setExcludePaths] = useState<string[]>([]);
  const [fileTypeRules, setFileTypeRules] = useState<FileTypeRules>({
    pdf: 'index',
    docx: 'index',
    csv: 'skip',
  });
  const [crawlConfig, setCrawlConfig] = useState<CrawlConfig>({
    maxDepth: 3,
    maxBreadth: 50,
    limit: 300,
    extractDepth: 'advanced',
  });
  const [crawlerInstructions, setCrawlerInstructions] = useState(DEFAULT_CRAWL_INSTRUCTIONS);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [newExternalUrl, setNewExternalUrl] = useState('');
  const [newExternalLabel, setNewExternalLabel] = useState('');
  const [newExcludePath, setNewExcludePath] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeys>({
    mongodbUri: '',
    chatApiKey: '',
    chatBaseUrl: '',
    chatModel: '',
    chatMaxTokens: 32000,
    chatMaxSteps: 5,
    embeddingApiKey: '',
    embeddingModel: 'voyage-4-large',
    embeddingDimensions: 2048,
    tavilyApiKey: '',
    uploadthingSecret: '',
    uploadthingAppId: '',
    adminSecret: '',
  });
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [crawlLogs, setCrawlLogs] = useState<CrawlLogEntry[]>([]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/onboarding/complete');
        if (res.ok) {
          const data = await res.json();
          if (data.apiKeys) {
            const safeKeys = data.apiKeys as Partial<ApiKeys>;
            setApiKeys(prev => mergeApiKeys(prev, safeKeys));
          }
          if (data.uniUrl) setUniversityUrl(data.uniUrl);
          if (data.appName || data.brandPrimary || data.emoji || data.logoUrl) {
            setBrandData(prev => ({
              ...prev,
              universityName: data.appName || prev.universityName,
              primaryColor: data.brandPrimary || prev.primaryColor,
              secondaryColor: data.brandSecondary || prev.secondaryColor,
              emoji: data.emoji || prev.emoji,
              logoUrl: data.logoUrl || prev.logoUrl,
              iconType: data.iconType || prev.iconType,
              showTitle: data.showTitle ?? prev.showTitle,
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch existing settings:', err);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', brandData.primaryColor);
    document.documentElement.style.setProperty('--accent-light', brandData.primaryColor + '15');
    document.documentElement.style.setProperty('--accent-mid', brandData.primaryColor + '80');
    document.documentElement.style.setProperty('--accent-glow', brandData.primaryColor + '40');
  }, [brandData.primaryColor]);


  const startCrawl = useCallback(async () => {
    setLoading(true);
    setCrawlLogs([]);
    const initialProgress = {
      phase: 'preparing' as const,
      message: 'Preparing crawl...',
      pagesFound: 0,
      pagesProcessed: 0,
      chunksCreated: 0,
      docsStored: 0,
    };
    setCrawlProgress(initialProgress);
    setCrawlLogs([
      {
        timestamp: new Date().toISOString(),
        phase: 'preparing',
        message: 'Starting crawl process...',
      },
    ]);
    setStep(4);

    try {
      const res = await fetch('/api/onboarding/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityUrl,
          externalUrls: externalUrls.map((e) => e.url),
          excludePaths,
          fileTypeRules,
          brandPrimary: brandData.primaryColor,
          universityName: brandData.universityName,
          logoUrl: brandData.logoUrl,
          crawlConfig,
          crawlerInstructions,
          apiKeys: {
            embeddingApiKey: apiKeys.embeddingApiKey,
            embeddingModel: apiKeys.embeddingModel,
            embeddingDimensions: apiKeys.embeddingDimensions,
            tavilyApiKey: apiKeys.tavilyApiKey,
            mongodbUri: apiKeys.mongodbUri,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start crawl');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: CrawlProgress = JSON.parse(line.slice(6));
              setCrawlProgress(data);
              setCrawlLogs((prev) => [
                ...prev,
                {
                  timestamp: new Date().toISOString(),
                  phase: data.phase,
                  message: data.message,
                  url: data.currentUrl,
                },
              ]);
              if (data.phase === 'complete') {
                setStep(5);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(errorMessage);
      setCrawlProgress((prev) =>
        prev ? { ...prev, phase: 'error', error: errorMessage } : null
      );
    } finally {
      setLoading(false);
    }
  }, [universityUrl, externalUrls, excludePaths, fileTypeRules, brandData, crawlConfig, crawlerInstructions, apiKeys]);

  const completeOnboarding = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          universityUrl,
          universityName: brandData.universityName,
          brandPrimary: brandData.primaryColor,
          brandSecondary: brandData.secondaryColor,
          logoUrl: brandData.logoUrl,
          emoji: brandData.emoji,
          iconType: brandData.iconType,
          showTitle: brandData.showTitle,
          crawlConfig,
          excludePaths,
          externalUrls: externalUrls.map((e) => e.url),
          fileTypeRules,
          apiKeys,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Failed to complete onboarding');
      }

      await res.json();

      toast.success('Onboarding complete!');
      router.push('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [universityUrl, brandData, router, crawlConfig, excludePaths, externalUrls, fileTypeRules, apiKeys]);

  const addExternalUrl = () => {
    if (newExternalUrl && !externalUrls.some((e) => e.url === newExternalUrl)) {
      setExternalUrls([...externalUrls, { url: newExternalUrl, label: newExternalLabel || newExternalUrl }]);
      setNewExternalUrl('');
      setNewExternalLabel('');
    }
  };

  const addExcludePath = () => {
    if (newExcludePath && !excludePaths.includes(newExcludePath)) {
      setExcludePaths([...excludePaths, newExcludePath]);
      setNewExcludePath('');
    }
  };

  const renderStepTracker = () => (
    <div className="step-tracker">
      {STEPS.map((s, i) => (
        <div
          key={s.label}
          className={`step-item ${i === step ? 'active' : ''} ${i < step ? 'completed' : ''}`}
        >
          <div className="step-number" style={i <= step ? { backgroundColor: brandData.primaryColor } : {}}>
            {i < step ? <Check className="w-4 h-4" /> : i + 1}
          </div>
          <span className="step-label">{s.label}</span>
        </div>
      ))}
    </div>
  );

  const renderBrandPreview = () => (
    <div className="brand-preview">
      <div className="brand-preview-label">Brand Preview</div>
      <div className="rounded-lg overflow-hidden border bg-white">
        <div
          className="h-8 flex items-center px-3 gap-2"
          style={{ backgroundColor: brandData.primaryColor }}
        >
          {brandData.iconType === 'emoji' ? (
            <span className="text-lg">{brandData.emoji}</span>
          ) : brandData.logoUrl ? (
            <div className="w-4 h-4 rounded bg-white/30" />
          ) : (
            <span className="text-lg">🎓</span>
          )}
          <div className="w-20 h-2 rounded bg-white/30" />
        </div>
        <div className="p-3 space-y-2">
          <div
            className="h-3 w-3/4 rounded"
            style={{ backgroundColor: `${brandData.primaryColor}20` }}
          />
          <div className="h-2 w-full rounded bg-muted" />
          <div className="h-2 w-2/3 rounded bg-muted" />
          <div className="flex justify-end pt-1">
            <div
              className="h-6 w-16 rounded text-xs flex items-center justify-center text-white"
              style={{ backgroundColor: brandData.primaryColor }}
            >
              Ask
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderEnvPreview = () => {
    const maskedEnv = `# Generated by EduRAG Onboarding
MONGODB_URI=${apiKeys.mongodbUri ? apiKeys.mongodbUri.replace(/:([^@]+)@/, ':****@') : ''}
CHAT_API_KEY=${apiKeys.chatApiKey ? '****' + apiKeys.chatApiKey.slice(-4) : ''}
CHAT_BASE_URL=${apiKeys.chatBaseUrl || ''}
CHAT_MODEL=${apiKeys.chatModel || ''}
EMBEDDING_API_KEY=${apiKeys.embeddingApiKey ? '****' + apiKeys.embeddingApiKey.slice(-4) : ''}
TAVILY_API_KEY=${apiKeys.tavilyApiKey ? '****' + apiKeys.tavilyApiKey.slice(-4) : ''}
ADMIN_TOKEN=${apiKeys.adminSecret ? '****' + apiKeys.adminSecret.slice(-4) : ''}`;

    return (
      <div className="rounded-lg border overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 flex items-center justify-between border-b">
          <span className="text-sm font-medium text-muted-foreground">.env.local</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(maskedEnv);
              setCopiedToClipboard(true);
              setTimeout(() => setCopiedToClipboard(false), 2000);
            }}
          >
            {copiedToClipboard ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <pre className="p-4 text-sm overflow-x-auto bg-slate-950 text-slate-50">
          <code>{maskedEnv}</code>
        </pre>
      </div>
    );
  };

  const renderCrawlLogs = () => (
    <details className="group">
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
        <span className="transition-transform group-open:rotate-90">▶</span>
        View Crawl Logs ({crawlLogs.length} entries)
      </summary>
      <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border bg-muted/30">
        {crawlLogs.map((log, idx) => (
          <div
            key={idx}
            className="px-4 py-2 border-b last:border-b-0 flex items-start gap-3 text-sm"
          >
            <span className="text-xs text-muted-foreground font-mono shrink-0">
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span
              className="capitalize font-medium shrink-0"
              style={{ color: log.phase === 'error' ? '#ef4444' : brandData.primaryColor }}
            >
              {log.phase}
            </span>
            <span className="text-muted-foreground flex-1">
              {log.message}
              {log.url && (
                <span className="block text-xs truncate mt-0.5">{log.url}</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </details>
  );

  return (
    <div className="onboarding-container">
      <Toaster position="bottom-right" />

      <aside className="onboarding-sidebar" style={{ backgroundColor: `${brandData.primaryColor}08` }}>
        <div className="brand-logo">
          {brandData.iconType === 'emoji' ? (
            <div className="logo-placeholder">{brandData.emoji}</div>
          ) : brandData.logoUrl ? (
            <img src={brandData.logoUrl} alt="University Logo" className="logo-img" />
          ) : (
            <div className="logo-placeholder">🎓</div>
          )}
        </div>

        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold mb-1">
            Set up your <em style={{ color: brandData.primaryColor }}>university</em>
          </h2>
          <p className="text-sm text-muted-foreground">Knowledge base in 5 minutes</p>
        </div>

        {renderStepTracker()}
        {renderBrandPreview()}

        <div className="mt-auto pt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="w-4 h-4" />
          <span>Secure setup • Data stays local</span>
        </div>
      </aside>

      <main className="onboarding-content">
        <div className="step-panel">
          {step === 0 && (
            <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <CardHeader>
                <CardTitle>Welcome to EduRAG</CardTitle>
                <CardDescription>
                  Enter your university&apos;s website URL to get started.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="uniUrl">University Website URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="uniUrl"
                      type="url"
                      placeholder="https://university.edu"
                      value={universityUrl}
                      onChange={(e) => setUniversityUrl(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => setStep(1)}
                      disabled={!universityUrl}
                      style={{ backgroundColor: brandData.primaryColor }}
                      className="text-white"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
                <Alert>
                  <AlertDescription className="text-sm">
                    We&apos;ll crawl your university website and build a knowledge base
                    that students can chat with.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-2xl font-semibold">Branding</h1>
                <p className="text-muted-foreground">
                  Customize how your knowledge base looks.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">University Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="uniName">University Name</Label>
                    <Input
                      id="uniName"
                      placeholder="University of Example"
                      value={brandData.universityName}
                      onChange={(e) =>
                        setBrandData((prev) => ({ ...prev, universityName: e.target.value }))
                      }
                    />
                  </div>

                  <Tabs value={brandData.iconType} onValueChange={(v) => setBrandData((prev) => ({ ...prev, iconType: v as 'logo' | 'emoji' | 'upload' }))}>
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="emoji" className="flex items-center gap-2">
                        <Smile className="w-4 h-4" />
                        <span className="hidden sm:inline">Emoji</span>
                      </TabsTrigger>
                      <TabsTrigger value="upload" className="flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        <span className="hidden sm:inline">Upload</span>
                      </TabsTrigger>
                      <TabsTrigger value="logo" className="flex items-center gap-2">
                        <ImageUp className="w-4 h-4" />
                        <span className="hidden sm:inline">URL</span>
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="emoji" className="space-y-3">
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-3xl"
                          style={{ backgroundColor: `${brandData.primaryColor}20` }}
                        >
                          {brandData.emoji || '🎓'}
                        </div>
                        <div>
                          <p className="font-medium">Selected Icon</p>
                          <p className="text-sm text-muted-foreground">
                            {brandData.emoji || 'Click an emoji below to select'}
                          </p>
                        </div>
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <EmojiPicker
                          onEmojiClick={(emojiData) => {
                            setBrandData((prev) => ({ ...prev, emoji: emojiData.emoji }));
                          }}
                          width="100%"
                          height={350}
                          searchPlaceHolder="Search icons..."
                          previewConfig={{ showPreview: false }}
                          skinTonesDisabled
                        />
                      </div>
                    </TabsContent>
                    <TabsContent value="upload" className="space-y-4">
                      <div className="space-y-3">
                        <Label>Upload Logo Image</Label>
                        <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/webp"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              setUploadingLogo(true);
                              try {
                                const formData = new FormData();
                                formData.append('file', file);

                                const res = await fetch('/api/upload', {
                                  method: 'POST',
                                  body: formData,
                                });

                                if (!res.ok) throw new Error('Upload failed');

                                const data = await res.json();
                                setBrandData((prev) => ({
                                  ...prev,
                                  logoUrl: data.url,
                                  uploadedFileName: data.fileName,
                                }));
                                toast.success('Logo uploaded successfully');
                              } catch {
                                toast.error('Failed to upload logo');
                              } finally {
                                setUploadingLogo(false);
                              }
                            }}
                            className="hidden"
                            id="logo-upload"
                          />
                          <label htmlFor="logo-upload" className="cursor-pointer">
                            {uploadingLogo ? (
                              <div className="flex flex-col items-center gap-2">
                                <Loader2 className="w-10 h-10 text-muted-foreground animate-spin" />
                                <p className="text-sm text-muted-foreground">Uploading...</p>
                              </div>
                            ) : brandData.logoUrl && brandData.iconType === 'upload' ? (
                              <div className="flex flex-col items-center gap-2">
                                <img
                                  src={brandData.logoUrl}
                                  alt="Uploaded logo"
                                  className="w-16 h-16 object-contain rounded-lg"
                                />
                                <p className="text-sm text-muted-foreground">Click to change</p>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <Upload className="w-10 h-10 text-muted-foreground" />
                                <p className="text-sm font-medium">Click to upload</p>
                                <p className="text-xs text-muted-foreground">PNG, JPEG, WebP (max 5MB)</p>
                              </div>
                            )}
                          </label>
                        </div>
                        {brandData.logoUrl && brandData.iconType === 'upload' && (
                          <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                            <img
                              src={brandData.logoUrl}
                              alt="Logo preview"
                              className="w-10 h-10 object-contain"
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Logo uploaded</p>
                              <p className="text-xs text-muted-foreground">{brandData.uploadedFileName}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                    <TabsContent value="logo" className="space-y-3">
                      <Label htmlFor="logoUrl">Logo Image URL</Label>
                      <Input
                        id="logoUrl"
                        placeholder="https://university.edu/logo.png"
                        value={brandData.iconType === 'logo' ? brandData.logoUrl : ''}
                        onChange={(e) =>
                          setBrandData((prev) => ({ ...prev, logoUrl: e.target.value }))
                        }
                      />
                      {brandData.logoUrl && brandData.iconType === 'logo' && (
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                          <img
                            src={brandData.logoUrl}
                            alt="Logo preview"
                            className="w-10 h-10 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                          <span className="text-sm text-muted-foreground">Logo preview</span>
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    Brand Colors
                  </CardTitle>
                  <CardDescription>Choose colors that match your university&apos;s branding</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label>Primary Color</Label>
                    <ColorPicker
                      value={brandData.primaryColor}
                      onChange={(val) => {
                        const preset = PRESET_COLORS.find(p => p.primary === val);
                        setBrandData(prev => ({
                          ...prev,
                          primaryColor: val,
                          ...(preset && { secondaryColor: preset.secondary })
                        }));
                      }}
                      presets={PRESET_COLORS}
                      className="w-full"
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Secondary Color</Label>
                    <ColorPicker
                      value={brandData.secondaryColor}
                      onChange={(val) => setBrandData(prev => ({ ...prev, secondaryColor: val }))}
                      presets={PRESET_COLORS}
                      className="w-full"
                    />
                  </div>

                  <div className="p-4 rounded-lg border bg-muted/50">
                    <Label className="text-sm text-muted-foreground mb-2 block">Preview</Label>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl"
                        style={{ backgroundColor: brandData.primaryColor }}
                      >
                        {brandData.iconType === 'emoji' ? brandData.emoji : '🎓'}
                      </div>
                      {brandData.showTitle && (
                        <div className="flex-1">
                          <div className="h-3 w-32 rounded mb-1" style={{ backgroundColor: brandData.primaryColor }} />
                          <div className="h-2 w-24 rounded" style={{ backgroundColor: brandData.secondaryColor }} />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <Label>Show Title in Header</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Display the university name next to the icon in the header
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={brandData.showTitle}
                      onClick={() => setBrandData(prev => ({ ...prev, showTitle: !prev.showTitle }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${brandData.showTitle ? 'bg-primary' : 'bg-muted'
                        }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${brandData.showTitle ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!brandData.universityName}
                  style={{ backgroundColor: brandData.primaryColor }}
                  className="text-white"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-2xl font-semibold">Crawl Scope</h1>
                <p className="text-muted-foreground">
                  Configure what content to include in your knowledge base.
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Crawl Settings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>Max Depth</Label>
                      <Input
                        type="number"
                        min={1}
                        max={5}
                        value={crawlConfig.maxDepth}
                        onChange={(e) =>
                          setCrawlConfig((prev) => ({
                            ...prev,
                            maxDepth: Math.min(5, Math.max(1, parseInt(e.target.value) || 1)),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">Crawl depth (1-5 levels)</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Max Breadth</Label>
                      <Input
                        type="number"
                        min={1}
                        value={crawlConfig.maxBreadth}
                        onChange={(e) =>
                          setCrawlConfig((prev) => ({
                            ...prev,
                            maxBreadth: Math.max(1, parseInt(e.target.value) || 1),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">Links per page</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Page Limit</Label>
                      <Input
                        type="number"
                        min={1}
                        value={crawlConfig.limit}
                        onChange={(e) =>
                          setCrawlConfig((prev) => ({
                            ...prev,
                            limit: Math.max(1, parseInt(e.target.value) || 1),
                          }))
                        }
                      />
                      <p className="text-xs text-muted-foreground">Max pages to crawl</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Extract Depth</Label>
                      <Select
                        value={crawlConfig.extractDepth}
                        onValueChange={(v: 'basic' | 'advanced') =>
                          setCrawlConfig((prev) => ({ ...prev, extractDepth: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Crawler Instructions</CardTitle>
                  <CardDescription>Special instructions for the crawler</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Focus on course catalogs, faculty pages, and academic programs..."
                    value={crawlerInstructions}
                    onChange={(e) => setCrawlerInstructions(e.target.value)}
                    rows={3}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">External URLs</CardTitle>
                  <CardDescription>Add additional URLs to include in the crawl</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {externalUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {externalUrls.map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="gap-1">
                          {item.label}
                          <button
                            onClick={() => setExternalUrls(externalUrls.filter((_, i) => i !== idx))}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Label"
                      value={newExternalLabel}
                      onChange={(e) => setNewExternalLabel(e.target.value)}
                      className="w-32"
                    />
                    <Input
                      placeholder="https://external-site.com"
                      value={newExternalUrl}
                      onChange={(e) => setNewExternalUrl(e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="outline" onClick={addExternalUrl} disabled={!newExternalUrl}>
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Exclude Paths</CardTitle>
                  <CardDescription>Paths to skip during crawling (e.g., /archive/*, /admin/*)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {excludePaths.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {excludePaths.map((path, idx) => (
                        <Badge key={idx} variant="outline" className="gap-1">
                          {path}
                          <button
                            onClick={() => setExcludePaths(excludePaths.filter((_, i) => i !== idx))}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="/archive/*"
                      value={newExcludePath}
                      onChange={(e) => setNewExcludePath(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && addExcludePath()}
                    />
                    <Button variant="outline" onClick={addExcludePath} disabled={!newExcludePath}>
                      Add
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">File Types</CardTitle>
                  <CardDescription>Choose how to handle different file types</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {(Object.keys(fileTypeRules) as Array<keyof FileTypeRules>).map((type) => (
                      <div key={type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor:
                                type === 'pdf' ? '#ef4444' : type === 'docx' ? '#3b82f6' : '#22c55e',
                            }}
                          />
                          <Label className="font-medium">{type.toUpperCase()}</Label>
                        </div>
                        <RadioGroup
                          value={fileTypeRules[type]}
                          onValueChange={(value: 'index' | 'skip') =>
                            setFileTypeRules((prev) => ({ ...prev, [type]: value }))
                          }
                          orientation="horizontal"
                          className="flex gap-4"
                        >
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="index" id={`${type}-index`} />
                            <Label htmlFor={`${type}-index`} className="font-normal cursor-pointer">
                              Index
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="skip" id={`${type}-skip`} />
                            <Label htmlFor={`${type}-skip`} className="font-normal cursor-pointer">
                              Skip
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  style={{ backgroundColor: brandData.primaryColor }}
                  className="text-white"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl font-semibold">API Configuration</h2>
                <p className="text-muted-foreground mt-1">
                  Configure the API keys required for EduRAG to function
                </p>
              </div>

              <div className="grid gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="w-5 h-5" style={{ color: brandData.primaryColor }} />
                      Storage & Database
                    </CardTitle>
                    <CardDescription>
                      Configure your MongoDB connection for vector search
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="mongodbUri">MongoDB Connection String *</Label>
                      <PasswordInput
                        id="mongodbUri"
                        placeholder="mongodb+srv://..."
                        value={apiKeys.mongodbUri}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, mongodbUri: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Smile className="w-5 h-5" style={{ color: brandData.primaryColor }} />
                      AI Models
                    </CardTitle>
                    <CardDescription>
                      Keys for chat generation and chunk embeddings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="chatApiKey">Chat API Key *</Label>
                      <PasswordInput
                        id="chatApiKey"
                        placeholder="sk-..."
                        value={apiKeys.chatApiKey}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, chatApiKey: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="embeddingApiKey">Embedding API Key *</Label>
                      <PasswordInput
                        id="embeddingApiKey"
                        placeholder="pa-..."
                        value={apiKeys.embeddingApiKey}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, embeddingApiKey: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="embeddingModel">Embedding Model</Label>
                        <Input
                          id="embeddingModel"
                          placeholder="voyage-4-large"
                          value={apiKeys.embeddingModel}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, embeddingModel: e.target.value }))}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="embeddingDimensions">Dimensions</Label>
                        <Input
                          id="embeddingDimensions"
                          type="number"
                          placeholder="2048"
                          value={apiKeys.embeddingDimensions}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, embeddingDimensions: parseInt(e.target.value) || 2048 }))}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="chatBaseUrl">Chat API Base URL (Optional)</Label>
                      <Input
                        id="chatBaseUrl"
                        placeholder="https://api.cerebras.ai/v1"
                        value={apiKeys.chatBaseUrl}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, chatBaseUrl: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="chatModel">Chat Model (Optional)</Label>
                      <Input
                        id="chatModel"
                        placeholder="llama-3.3-70b"
                        value={apiKeys.chatModel}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, chatModel: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="chatMaxTokens">Max Tokens</Label>
                        <Input
                          id="chatMaxTokens"
                          type="number"
                          placeholder="32000"
                          value={apiKeys.chatMaxTokens}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, chatMaxTokens: parseInt(e.target.value) || 32000 }))}
                          className="font-mono text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="chatMaxSteps">Max Steps</Label>
                        <Input
                          id="chatMaxSteps"
                          type="number"
                          min={1}
                          max={20}
                          placeholder="5"
                          value={apiKeys.chatMaxSteps}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, chatMaxSteps: Math.min(20, Math.max(1, parseInt(e.target.value) || 5)) }))}
                          className="font-mono text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Upload className="w-5 h-5" style={{ color: brandData.primaryColor }} />
                      Crawling & Security
                    </CardTitle>
                    <CardDescription>
                      Configure web crawling and administrative access
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tavilyApiKey">Tavily API Key *</Label>
                      <PasswordInput
                        id="tavilyApiKey"
                        placeholder="tvly-..."
                        value={apiKeys.tavilyApiKey}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, tavilyApiKey: e.target.value }))}
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="adminSecret">Admin Secret *</Label>
                      <div className="flex gap-2">
                        <PasswordInput
                          id="adminSecret"
                          placeholder="your-secure-admin-token"
                          value={apiKeys.adminSecret}
                          onChange={(e) => setApiKeys((prev) => ({ ...prev, adminSecret: e.target.value }))}
                          className="font-mono text-sm flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const array = new Uint8Array(32);
                            crypto.getRandomValues(array);
                            const token = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
                            setApiKeys((prev) => ({ ...prev, adminSecret: token }));
                          }}
                        >
                          Generate
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Secure token for admin panel access</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="uploadthingSecret">Uploadthing Secret (Optional)</Label>
                      <PasswordInput
                        id="uploadthingSecret"
                        placeholder="sk_live_..."
                        value={apiKeys.uploadthingSecret}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, uploadthingSecret: e.target.value }))}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">For cloud logo storage on Vercel/Netlify</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="uploadthingAppId">Uploadthing App ID (Optional)</Label>
                      <Input
                        id="uploadthingAppId"
                        placeholder="abc123..."
                        value={apiKeys.uploadthingAppId}
                        onChange={(e) => setApiKeys((prev) => ({ ...prev, uploadthingAppId: e.target.value }))}
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">Get from uploadthing.com (free tier available)</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <Shield className="w-4 h-4" />
                <AlertTitle>Security Note</AlertTitle>
                <AlertDescription>
                  API keys are written to <code className="text-xs bg-muted px-1 rounded">.env.local</code> and never stored in the database.
                </AlertDescription>
              </Alert>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  onClick={startCrawl}
                  disabled={loading || !apiKeys.mongodbUri || !apiKeys.chatApiKey || !apiKeys.embeddingApiKey || !apiKeys.tavilyApiKey || !apiKeys.adminSecret}
                  style={{ backgroundColor: brandData.primaryColor }}
                  className="text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    'Start Crawling'
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && crawlProgress && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-2xl font-semibold">Crawling & Indexing</h1>
                <p className="text-muted-foreground">
                  Please wait while we crawl and index your content.
                </p>
              </div>

              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium capitalize" style={{ color: brandData.primaryColor }}>
                      {crawlProgress.phase}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {crawlProgress.pagesProcessed} / {crawlProgress.pagesFound} pages
                    </span>
                  </div>
                  <Progress
                    value={
                      crawlProgress.pagesFound > 0
                        ? (crawlProgress.pagesProcessed / crawlProgress.pagesFound) * 100
                        : 0
                    }
                    className="h-2"
                  />
                  <p className="text-sm text-muted-foreground">{crawlProgress.message}</p>
                  {crawlProgress.currentUrl && (
                    <p className="text-xs text-muted-foreground truncate">
                      Processing: {crawlProgress.currentUrl}
                    </p>
                  )}
                  {crawlProgress.error && (
                    <Alert variant="destructive">
                      <AlertDescription>{crawlProgress.error}</AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{crawlProgress.pagesFound}</div>
                    <div className="text-sm text-muted-foreground">Pages Found</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{crawlProgress.chunksCreated}</div>
                    <div className="text-sm text-muted-foreground">Chunks</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{crawlProgress.docsStored}</div>
                    <div className="text-sm text-muted-foreground">Documents</div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button disabled style={{ backgroundColor: brandData.primaryColor }} className="text-white opacity-50">
                  Crawl in Progress...
                </Button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-2xl font-semibold">Setup Complete!</h1>
                <p className="text-muted-foreground">
                  Review your configuration and launch your knowledge base.
                </p>
              </div>

              <Card className="overflow-hidden">
                <div
                  className="h-16 flex items-center px-6 gap-3"
                  style={{ backgroundColor: brandData.primaryColor }}
                >
                  {brandData.iconType === 'emoji' ? (
                    <span className="text-3xl">{brandData.emoji}</span>
                  ) : brandData.logoUrl ? (
                    <img
                      src={brandData.logoUrl}
                      alt="Logo"
                      className="h-10 object-contain brightness-0 invert"
                    />
                  ) : null}
                  {brandData.showTitle && (
                    <span className="text-white font-bold text-xl">
                      {brandData.universityName}
                    </span>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Brand Preview</CardTitle>
                  <CardDescription>
                    How your knowledge base will look with the selected branding
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border overflow-hidden bg-background">
                    <div
                      className="h-12 flex items-center px-4 gap-3 border-b"
                      style={{ backgroundColor: brandData.primaryColor }}
                    >
                      {brandData.iconType === 'emoji' ? (
                        <span className="text-2xl">{brandData.emoji}</span>
                      ) : brandData.logoUrl ? (
                        <img
                          src={brandData.logoUrl}
                          alt="Logo"
                          className="h-8 object-contain brightness-0 invert"
                        />
                      ) : (
                        <span className="text-2xl">🎓</span>
                      )}
                      {brandData.showTitle && (
                        <span className="text-white font-semibold">
                          {brandData.universityName}
                        </span>
                      )}
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                          style={{ backgroundColor: brandData.primaryColor }}
                        >
                          AI
                        </div>
                        <div
                          className="rounded-2xl rounded-tl-none px-4 py-2 max-w-[80%]"
                          style={{ backgroundColor: `${brandData.primaryColor}15` }}
                        >
                          <p className="text-sm">
                            Hello! I&apos;m your university knowledge assistant. How can I help you today?
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-3 justify-end">
                        <div className="rounded-2xl rounded-tr-none px-4 py-2 max-w-[80%] bg-muted">
                          <p className="text-sm">When is the fall semester registration deadline?</p>
                        </div>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                          style={{ backgroundColor: brandData.secondaryColor }}
                        >
                          U
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border-t bg-muted/30">
                      <div className="flex gap-2">
                        <Input placeholder="Ask a question..." className="flex-1" disabled />
                        <Button
                          style={{ backgroundColor: brandData.primaryColor }}
                          className="text-white"
                          disabled
                        >
                          Ask
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{crawlProgress?.pagesProcessed || 0}</div>
                    <div className="text-sm text-muted-foreground">Pages Indexed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{crawlProgress?.chunksCreated || 0}</div>
                    <div className="text-sm text-muted-foreground">Chunks Created</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold">{crawlProgress?.docsStored || 0}</div>
                    <div className="text-sm text-muted-foreground">Documents</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Configuration Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">University</span>
                      <span className="font-medium">{brandData.universityName}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Website</span>
                      <span className="font-medium">{universityUrl}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Primary Color</span>
                      <span className="font-medium flex items-center gap-2">
                        <span
                          className="w-4 h-4 rounded"
                          style={{ backgroundColor: brandData.primaryColor }}
                        />
                        {brandData.primaryColor}
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Crawl Depth</span>
                      <span className="font-medium">{crawlConfig.maxDepth} levels</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">Page Limit</span>
                      <span className="font-medium">{crawlConfig.limit} pages</span>
                    </div>
                  </div>

                  {crawlLogs.length > 0 && (
                    <div className="pt-2">
                      {renderCrawlLogs()}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5" />
                    Environment Variables
                  </CardTitle>
                  <CardDescription>
                    Your API keys have been written to .env.local (values shown are masked)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {renderEnvPreview()}
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Re-crawl
                </Button>
                <Button
                  onClick={completeOnboarding}
                  disabled={loading}
                  style={{ backgroundColor: brandData.primaryColor }}
                  className="text-white"
                  size="lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Launch Knowledge Base'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
