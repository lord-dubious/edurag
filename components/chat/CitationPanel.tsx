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
    <aside className="w-[340px] border-l bg-muted/20 p-5 overflow-y-auto animate-in slide-in-from-right-8 duration-300 shrink-0">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold">Sources</h3>
        <span className="flex items-center justify-center px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold font-mono">
          {sources.length}
        </span>
      </div>
      <div className="space-y-3">
        {sources.map((source, i) => {
          const domain = new URL(source.url).hostname.replace('www.', '');
          return (
            <a
              key={i}
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 p-3.5 bg-card border rounded-xl hover:border-primary/50 hover:bg-accent/40 hover:shadow-sm transition-all cursor-pointer no-underline"
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-[10px] font-mono font-bold text-primary">{i + 1}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h4 className="text-sm font-medium line-clamp-2 text-foreground group-hover:text-primary leading-snug">
                  {source.title ?? domain}
                </h4>
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                  {cleanSourcePreview(source.content, 120)}
                </p>
                <span className="text-[10px] text-primary/70 font-mono mt-1 block">
                  {domain}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </aside>
  );
}
