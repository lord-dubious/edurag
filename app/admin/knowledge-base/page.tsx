import { getSettings, updateSettings } from '@/lib/db/settings';
import { env } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Save, RefreshCw, Loader2 } from 'lucide-react';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { DEFAULT_CRAWL_INSTRUCTIONS } from '@/lib/constants';

async function saveCrawlSettings(formData: FormData) {
  'use server';
  
  const uniUrl = formData.get('uniUrl') as string;
  const maxDepth = Math.min(5, Math.max(1, parseInt(formData.get('maxDepth') as string) || 3));
  const maxBreadth = Math.max(1, parseInt(formData.get('maxBreadth') as string) || 50);
  const limit = Math.max(1, parseInt(formData.get('limit') as string) || 300);
  const crawlerInstructions = formData.get('crawlerInstructions') as string;
  
  await updateSettings({
    uniUrl,
    crawlConfig: {
      maxDepth,
      maxBreadth,
      limit,
    },
    crawlerInstructions: crawlerInstructions || undefined,
  });
  
  revalidatePath('/admin/knowledge-base');
}

export default async function KnowledgeBasePage() {
  const settings = await getSettings();
  
  const uniUrl = settings?.uniUrl || env.UNIVERSITY_URL || '';
  const maxDepth = settings?.crawlConfig?.maxDepth || env.CRAWL_MAX_DEPTH;
  const maxBreadth = settings?.crawlConfig?.maxBreadth || env.CRAWL_MAX_BREADTH;
  const limit = settings?.crawlConfig?.limit || env.CRAWL_LIMIT;
  const crawlerInstructions = settings?.crawlerInstructions || DEFAULT_CRAWL_INSTRUCTIONS;
  const crawlStatus = settings?.crawlStatus || 'complete';
  
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500',
    running: 'bg-blue-500 animate-pulse',
    complete: 'bg-green-500',
    failed: 'bg-red-500',
  };
  
  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    running: 'Running...',
    complete: 'Complete',
    failed: 'Failed',
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">
            Manage your crawled content and re-crawl settings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-2">
            <span className={`w-2 h-2 rounded-full ${statusColors[crawlStatus]}`} />
            {statusLabels[crawlStatus]}
          </Badge>
        </div>
      </div>
      
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">University URL</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono text-muted-foreground truncate" title={uniUrl}>
              {uniUrl || 'Not configured'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Crawl Depth</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{maxDepth} levels</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Page Limit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{limit.toLocaleString()} pages</p>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Trigger Re-Crawl</CardTitle>
          <CardDescription>
            Start a fresh crawl of your university website. This will re-index all content.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {crawlStatus === 'running' ? (
            <Button disabled size="lg">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Crawl in Progress...
            </Button>
          ) : (
            <Link href={`/admin/domains?crawl=${encodeURIComponent(uniUrl)}`}>
              <Button size="lg">
                <RefreshCw className="mr-2 h-4 w-4" />
                Start Re-Crawl
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
      
      <form action={saveCrawlSettings} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Crawl Configuration</CardTitle>
            <CardDescription>
              Settings for the next crawl operation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="uniUrl">University URL</Label>
              <Input
                id="uniUrl"
                name="uniUrl"
                type="url"
                defaultValue={uniUrl}
                placeholder="https://your-university.edu"
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxDepth">Max Depth</Label>
                <Input
                  id="maxDepth"
                  name="maxDepth"
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={maxDepth}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">1-5 levels</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxBreadth">Max Breadth</Label>
                <Input
                  id="maxBreadth"
                  name="maxBreadth"
                  type="number"
                  min={1}
                  defaultValue={maxBreadth}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Links per page</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="limit">Page Limit</Label>
                <Input
                  id="limit"
                  name="limit"
                  type="number"
                  min={1}
                  defaultValue={limit}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Max pages</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="crawlerInstructions">Crawl Instructions</Label>
              <Textarea
                id="crawlerInstructions"
                name="crawlerInstructions"
                defaultValue={crawlerInstructions}
                placeholder={DEFAULT_CRAWL_INSTRUCTIONS}
                rows={3}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Guide the crawler to focus on specific content
              </p>
            </div>
          </CardContent>
        </Card>
        
        <div className="flex justify-end">
          <Button type="submit">
            <Save className="mr-2 h-4 w-4" />
            Save Crawl Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
