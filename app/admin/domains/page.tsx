'use client';

import { useState, useEffect, useCallback } from 'react';
import { CrawlProgress } from '@/components/admin/CrawlProgress';

interface Domain {
  _id: string;
  url: string;
  name: string;
  threadId: string;
  createdAt: string;
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    url: '',
    maxDepth: 2,
    maxBreadth: 20,
    limit: 100,
    extractDepth: 'advanced' as 'basic' | 'advanced',
    instructions: '',
  });
  const [crawlProgress, setCrawlProgress] = useState<{
    active: boolean;
    url: string;
    page: number;
    total: number;
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
      if (data.success) setDomains(data.data);
    } catch (err) {
      console.error('Failed to fetch domains:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setDomains([data.data, ...domains]);
        setFormData(f => ({ ...f, url: '' }));
      }
    } catch (err) {
      console.error('Failed to add domain:', err);
    }
  };

  const handleCrawl = async (domain: Domain) => {
    setCrawlProgress({ active: true, url: domain.url, page: 0, total: 0 });

    const eventSource = new EventSource(`/api/crawl?threadId=${domain.threadId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        setCrawlProgress(p => p ? { ...p, page: data.page, total: data.total } : null);
      } else if (data.type === 'complete' || data.type === 'error') {
        eventSource.close();
        setCrawlProgress(null);
        fetchDomains();
      }
    };

    try {
      await fetch('/api/crawl', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: domain.url,
          threadId: domain.threadId,
          maxDepth: formData.maxDepth,
          maxBreadth: formData.maxBreadth,
          limit: formData.limit,
          extractDepth: formData.extractDepth,
          instructions: formData.instructions || undefined,
        }),
      });
    } catch (err) {
      console.error('Crawl failed:', err);
      setCrawlProgress(null);
    }
  };

  const handleDelete = async (threadId: string) => {
    if (!confirm('Delete this domain and all its indexed content?')) return;

    try {
      await fetch(`/api/domains?threadId=${threadId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDomains(domains.filter(d => d.threadId !== threadId));
    } catch (err) {
      console.error('Failed to delete domain:', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Domains</h1>

      <div className="bg-card p-6 rounded-lg border mb-6">
        <h2 className="text-lg font-semibold mb-4">Add Domain</h2>
        <form onSubmit={handleAddDomain} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">URL</label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="w-full px-3 py-2 border rounded-md"
              placeholder="https://university.edu"
              required
            />
          </div>
          <details className="group">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Crawl Options
            </summary>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm mb-1">Depth (1-5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={formData.maxDepth}
                  onChange={(e) => setFormData({ ...formData, maxDepth: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Breadth</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.maxBreadth}
                  onChange={(e) => setFormData({ ...formData, maxBreadth: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Page Limit</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={formData.limit}
                  onChange={(e) => setFormData({ ...formData, limit: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm mb-1">Extract Depth</label>
                <select
                  value={formData.extractDepth}
                  onChange={(e) => setFormData({ ...formData, extractDepth: e.target.value as 'basic' | 'advanced' })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="basic">Basic</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm mb-1">Instructions (optional)</label>
              <input
                type="text"
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="Focus on academic program pages..."
              />
            </div>
          </details>
          <button
            type="submit"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            Add Domain
          </button>
        </form>
      </div>

      {crawlProgress && (
        <CrawlProgress
          url={crawlProgress.url}
          page={crawlProgress.page}
          total={crawlProgress.total}
        />
      )}

      <div className="bg-card rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">Domain</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Added</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {domains.map((domain) => (
              <tr key={domain.threadId}>
                <td className="px-4 py-3">
                  <div className="font-medium">{domain.name}</div>
                  <div className="text-sm text-muted-foreground">{domain.url}</div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(domain.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => handleCrawl(domain)}
                    disabled={crawlProgress?.active}
                    className="px-3 py-1 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
                  >
                    Crawl
                  </button>
                  <button
                    onClick={() => handleDelete(domain.threadId)}
                    disabled={crawlProgress?.active}
                    className="px-3 py-1 text-sm border border-destructive text-destructive rounded-md hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
