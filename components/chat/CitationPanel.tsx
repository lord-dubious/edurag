'use client';

interface Source {
  url: string;
  title?: string;
  content: string;
}

interface Props {
  sources: Source[];
}

function cleanSourcePreview(content: string, maxLength = 150): string {
  if (!content) return 'Content preview not available';
  
  let cleaned = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (cleaned.length <= 30) return 'Content preview not available';
  
  // Detect navigation-heavy content - look for concatenated menu items without spaces
  // Pattern: "Services Services All ServicesAcademic & Student SuccessAthletics"
  const hasNavPattern = /[A-Z][a-z]+&[A-Z]/.test(cleaned) || // "SuccessAthletics" pattern
    /[A-Z][a-z]+[A-Z][a-z]+[A-Z]/.test(cleaned.slice(0, 100)) || // Multiple capitals without spaces
    cleaned.includes('Services Services') ||
    cleaned.includes('All Services') ||
    cleaned.includes('Academic & Student Success');
  
  if (hasNavPattern) {
    // Try to find meaningful sentences
    const meaningfulMatch = cleaned.match(/(?:St\.? Lawrence College|offers?|programs?|students?|campus|admission|tuition|international|diploma|bachelor|certificate|degree)[^.]{20,100}\./i);
    if (meaningfulMatch) {
      cleaned = meaningfulMatch[0];
    } else {
      return 'View page for details';
    }
  }
  
  if (cleaned.length <= maxLength) return cleaned;
  
  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength) + '...';
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
              {cleanSourcePreview(source.content, 120)}
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
