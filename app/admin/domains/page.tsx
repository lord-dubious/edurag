'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CrawlForm } from '@/components/admin/CrawlForm';
import { CrawlProgress } from '@/components/admin/CrawlProgress';
import { DomainTable, type Domain } from '@/components/admin/DomainTable';
import { Skeleton } from '@/components/ui/skeleton';

interface CrawlFormData {
  url: string;
  maxDepth: number;
  maxBreadth: number;
  limit: number;
  extractDepth: 'basic' | 'advanced';
  format: 'markdown' | 'text';
  selectPaths: string;
  excludePaths: string;
  instructions: string;
}

interface DomainApiResponse {
  _id: string;
  url: string;
  threadId: string;
  documentCount?: number;
  lastCrawled?: string | null;
  status?: 'indexed' | 'crawling' | 'error';
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<{
    active: boolean;
    url: string;
    page: number;
    total: number;
    message?: string;
  } | null>(null);

  const token = typeof document !== 'undefined'
    ? document.cookie.split('; ').find(c => c.startsWith('admin_token='))?.split('=')[1]
    : '';

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDomains(data.data.map((d: DomainApiResponse) => ({
          _id: d._id,
          url: d.url,
          threadId: d.threadId,
          documentCount: d.documentCount || 0,
          lastCrawled: d.lastCrawled ? new Date(d.lastCrawled) : null,
          status: d.status || 'indexed',
        })));
      }
    } catch (err) {
      console.error('Failed to fetch domains:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleAddDomain = async (formData: CrawlFormData) => {
    setActionLoading('adding');
    try {
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ url: formData.url }),
      });
      const data = await res.json();
      if (data.success) {
        const newDomain: Domain = {
          _id: data.data._id,
          url: data.data.url,
          threadId: data.data.threadId,
          documentCount: 0,
          lastCrawled: null,
          status: 'indexed',
        };
        setDomains([newDomain, ...domains]);
        handleCrawl(newDomain, formData);
      }
    } catch (err) {
      console.error('Failed to add domain:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCrawl = async (domain: Domain, options?: Partial<CrawlFormData>) => {
    setCrawlProgress({ active: true, url: domain.url, page: 0, total: 0 });

    setDomains(domains.map(d => 
      d.threadId === domain.threadId ? { ...d, status: 'crawling' as const } : d
    ));

    try {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: domain.url,
          threadId: domain.threadId,
          maxDepth: options?.maxDepth ?? 2,
          maxBreadth: options?.maxBreadth ?? 20,
          limit: options?.limit ?? 100,
          extractDepth: options?.extractDepth ?? 'advanced',
          selectPaths: options?.selectPaths ? options.selectPaths.split(',').map(p => p.trim()).filter(Boolean) : undefined,
          excludePaths: options?.excludePaths ? options.excludePaths.split(',').map(p => p.trim()).filter(Boolean) : undefined,
          instructions: options?.instructions || undefined,
        }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n').filter(line => line.startsWith('data: '));

          for (const line of lines) {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'status') {
              setCrawlProgress(p => p ? { ...p, message: data.message } : null);
            } else if (data.type === 'progress') {
              setCrawlProgress(p => p ? { ...p, page: data.page, total: data.total } : null);
            } else if (data.type === 'complete') {
              setCrawlProgress(null);
              fetchDomains();
            } else if (data.type === 'error') {
              setCrawlProgress(null);
              setDomains(domains.map(d => 
                d.threadId === domain.threadId ? { ...d, status: 'error' as const } : d
              ));
            }
          }
        }
      }
    } catch (err) {
      console.error('Crawl failed:', err);
      setCrawlProgress(null);
      setDomains(domains.map(d => 
        d.threadId === domain.threadId ? { ...d, status: 'error' as const } : d
      ));
    }
  };

  const handleReindex = (domain: Domain) => {
    handleCrawl(domain);
  };

  const handleDelete = async (domain: Domain) => {
    setActionLoading(`delete-${domain.threadId}`);
    try {
      await fetch(`/api/domains?threadId=${domain.threadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDomains(domains.filter(d => d.threadId !== domain.threadId));
    } catch (err) {
      console.error('Failed to delete domain:', err);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Domains</h1>
        <p className="text-muted-foreground">Manage crawled domains and knowledge base sources</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add Domain</CardTitle>
          <CardDescription>
            Add a university website to crawl and index for the knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CrawlForm onSubmit={handleAddDomain} isLoading={actionLoading === 'adding'} />
        </CardContent>
      </Card>

      {crawlProgress?.active && (
        <CrawlProgress
          url={crawlProgress.url}
          page={crawlProgress.page}
          total={crawlProgress.total}
          message={crawlProgress.message}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Indexed Domains</CardTitle>
          <CardDescription>
            {domains.length} domain{domains.length !== 1 ? 's' : ''} in the knowledge base
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <DomainTable
              domains={domains}
              onReindex={handleReindex}
              onDelete={handleDelete}
              isLoading={!!crawlProgress?.active}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
