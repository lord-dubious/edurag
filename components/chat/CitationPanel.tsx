'use client';

interface Source {
  url: string;
  title?: string;
  content: string;
}

interface Props {
  sources: Source[];
}

export function CitationPanel({ sources }: Props) {
  if (sources.length === 0) return null;

  return (
    <aside className="w-80 border-l bg-muted/30 p-4 overflow-y-auto">
      <h3 className="text-sm font-semibold mb-3">Sources ({sources.length})</h3>
      <div className="space-y-3">
        {sources.map((source, i) => (
          <a
            key={i}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 bg-card border rounded-lg hover:border-primary transition-colors"
          >
            <h4 className="text-sm font-medium line-clamp-2 mb-1">
              {source.title ?? source.url}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-3">
              {source.content.slice(0, 150)}…
            </p>
            <span className="text-xs text-primary mt-2 inline-block">
              {new URL(source.url).hostname}
            </span>
          </a>
        ))}
      </div>
    </aside>
  );
}
