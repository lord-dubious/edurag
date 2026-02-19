'use client';

interface CrawlProgressProps {
  url: string;
  page: number;
  total: number;
}

export function CrawlProgress({ url, page, total }: CrawlProgressProps) {
  const percentage = total > 0 ? Math.round((page / total) * 100) : 0;

  return (
    <div className="bg-card p-4 rounded-lg border mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Crawling {url}</span>
        <span className="text-sm text-muted-foreground">{page}/{total} pages</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
