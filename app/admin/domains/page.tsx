'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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

interface VerificationSummary {
  checkedSources: number;
  dead: number;
  errors: number;
  contentMismatch: number;
}

interface VerificationResult {
  url: string;
  linkStatus: string;
  contentStatus: string;
}

/**
 * Determines whether a value is a non-null object.
 *
 * @param value - The value to check.
 * @returns `true` if `value` is a non-null object, `false` otherwise.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Asserts whether a value conforms to the VerificationSummary shape.
 *
 * @returns `true` if `value` is a record containing finite numeric `checkedSources`, `dead`, `errors`, and `contentMismatch`, `false` otherwise.
 */
function isVerificationSummary(value: unknown): value is VerificationSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.checkedSources === 'number' &&
    Number.isFinite(value.checkedSources) &&
    typeof value.dead === 'number' &&
    Number.isFinite(value.dead) &&
    typeof value.errors === 'number' &&
    Number.isFinite(value.errors) &&
    typeof value.contentMismatch === 'number' &&
    Number.isFinite(value.contentMismatch)
  );
}

/**
 * Determines whether a value matches the shape of a VerificationResult.
 *
 * @param value - The value to validate as a verification result
 * @returns `true` if `value` is a record with string `url`, `linkStatus`, and `contentStatus`; `false` otherwise.
 */
function isVerificationResult(value: unknown): value is VerificationResult {
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.linkStatus === 'string' &&
    typeof value.contentStatus === 'string'
  );
}

/**
 * Determines whether a value is an array of verification result objects.
 *
 * @param value - The value to test
 * @returns `true` if `value` is an array and every element satisfies `VerificationResult`, `false` otherwise.
 */
function isVerificationResultArray(value: unknown): value is VerificationResult[] {
  return Array.isArray(value) && value.every(isVerificationResult);
}

/**
 * Render the admin "Domains" management page and manage domain lifecycle actions.
 *
 * This client component displays domain statistics, a form to add domains, recent crawl activity,
 * an indexed domains table, and an active crawl progress view. It also handles fetching domains,
 * starting crawls (including reindexing), deleting domains, and verifying source URLs; it performs
 * client-side auth-checks and redirects to the admin login when the session token is missing or invalid.
 *
 * @returns The React element for the Domains admin UI (statistics, add form, recent crawls, indexed table, and crawl controls).
 */
export default function DomainsPage() {
  const router = useRouter();
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

  useEffect(() => {
    if (!token) {
      router.replace('/admin/login');
    }
  }, [router, token]);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch('/api/domains', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        router.replace('/admin/login');
        return;
      }
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
  }, [router, token]);

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
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
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
            } catch {
              // Skip malformed JSON
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

  const handleVerify = async (domain: Domain) => {
    setActionLoading(`verify-${domain.threadId}`);
    try {
      const res = await fetch('/api/domains/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ threadId: domain.threadId }),
      });

      if (res.status === 401) {
        router.replace('/admin/login');
        return;
      }
      const data = await res.json().catch(() => ({}));

      const dataRecord = isRecord(data) ? data : null;
      if (!res.ok || dataRecord?.success !== true) {
        throw new Error((dataRecord && typeof dataRecord.error === 'string' && dataRecord.error) || 'Verification failed');
      }

      const summary = isVerificationSummary(dataRecord?.summary) ? dataRecord.summary : null;
      const results = isVerificationResultArray(dataRecord?.results) ? dataRecord.results : [];
      if (!summary) {
        throw new Error('Verification failed');
      }

      const hasIssues = summary.dead > 0 || summary.errors > 0 || summary.contentMismatch > 0;
      if (!hasIssues) {
        toast.success(`Verification passed for ${summary.checkedSources} sources.`);
      } else {
        const issueParts = [
          summary.dead > 0 ? `${summary.dead} dead` : '',
          summary.errors > 0 ? `${summary.errors} errors` : '',
          summary.contentMismatch > 0 ? `${summary.contentMismatch} content mismatches` : '',
        ].filter(Boolean);
        toast.warning(`Verification found issues: ${issueParts.join(', ')}.`);

        const flagged = results
          .filter(result => result.linkStatus === 'dead' || result.linkStatus === 'error' || result.contentStatus === 'mismatch')
          .slice(0, 3)
          .map((result) => {
            try {
              return new URL(result.url).hostname;
            } catch {
              return result.url;
            }
          })
          .filter(Boolean);

        if (flagged.length > 0) {
          toast.info(`Check: ${flagged.join(', ')}`);
        }
      }
    } catch (err) {
      console.error('Verification failed:', err);
      toast.error('Failed to verify sources');
    } finally {
      setActionLoading(null);
    }
  };

  const indexedCount = domains.filter(d => d.status === 'indexed').length;
  const crawlingCount = domains.filter(d => d.status === 'crawling').length;
  const errorCount = domains.filter(d => d.status === 'error').length;
  const totalDocuments = domains.reduce((sum, d) => sum + (d.documentCount || 0), 0);
  const recentDomains = [...domains]
    .sort((a, b) => {
      const aTime = a.lastCrawled ? new Date(a.lastCrawled).getTime() : 0;
      const bTime = b.lastCrawled ? new Date(b.lastCrawled).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Domains</h1>
        <p className="text-muted-foreground">Manage crawled domains and knowledge base sources</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Domains</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{domains.length}</div>
            <p className="text-xs text-muted-foreground">Connected sources</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Indexed Docs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDocuments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Search-ready content</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Crawling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{crawlingCount}</div>
            <p className="text-xs text-muted-foreground">Active jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{errorCount}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
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

      <Card>
        <CardHeader>
          <CardTitle>Recent Crawls</CardTitle>
          <CardDescription>Latest domains and their crawl status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentDomains.length === 0 ? (
            <div className="text-sm text-muted-foreground">No crawl activity yet.</div>
          ) : (
            recentDomains.map(domain => (
              <div key={domain._id} className="flex items-center justify-between border rounded-lg px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{domain.url}</div>
                  <div className="text-xs text-muted-foreground">
                    Last crawled: {domain.lastCrawled ? new Date(domain.lastCrawled).toLocaleString() : 'Not yet'}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {domain.documentCount.toLocaleString()} docs
                </div>
              </div>
            ))
          )}
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
              onVerify={handleVerify}
              onDelete={handleDelete}
              isLoading={!!crawlProgress?.active || Boolean(actionLoading?.startsWith('verify-'))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
