'use client';

import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface CrawlProgressProps {
  url: string;
  page: number;
  total: number;
  message?: string;
}

export function CrawlProgress({ url, page, total, message }: CrawlProgressProps) {
  const percentage = total > 0 ? Math.round((page / total) * 100) : 0;
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  })();

  return (
    <div className="bg-card p-4 rounded-lg border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Crawling {hostname}</span>
          <Badge variant="secondary" className="font-mono">
            {page}/{total}
          </Badge>
        </div>
        <span className="text-sm text-muted-foreground font-mono">{percentage}%</span>
      </div>
      <Progress value={percentage} className="h-2" />
      {message && (
        <p className="text-xs text-muted-foreground mt-2 truncate">{message}</p>
      )}
    </div>
  );
}
