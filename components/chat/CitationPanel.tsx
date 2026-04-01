'use client';

interface Source {
  url: string;
  title?: string;
  content: string;
  sourceType?: 'vector' | 'web';
}

interface Props {
  sources: Source[];
}

/**
 * Validate and normalize a URL, returning it only if it uses the HTTP or HTTPS scheme.
 *
 * @param url - The input URL string to validate and normalize
 * @returns The normalized URL string if its protocol is `http:` or `https:`, `null` otherwise
 */
function getSafeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts a display-friendly hostname from a URL.
 *
 * @param url - The input URL string to parse
 * @returns The hostname with a leading `www.` removed, or `'source'` if the URL cannot be parsed or hostname is empty
 */
function getSourceHostname(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return hostname || 'source';
  } catch {
    return 'source';
  }
}

/**
 * Produce a short, display-safe preview string from source content.
 *
 * The function strips HTML tags and markdown links, collapses whitespace, and trims the result.
 * If the content is falsy or the cleaned text is too short, returns "Content preview not available".
 * If the text appears to be navigation-heavy, attempts to extract a meaningful sentence; if none is found,
 * returns "View page for details".
 * If the cleaned text exceeds `maxLength`, truncates at `maxLength` then backtracks to the previous space
 * (if any) and appends an ellipsis.
 *
 * @param content - The raw source content to clean and shorten
 * @param maxLength - Maximum number of characters for the preview (defaults to 150)
 * @returns A display-safe preview string, or one of the sentinel messages `"Content preview not available"` or `"View page for details"`
 */
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

/**
 * Render a right-side panel listing citation sources.
 *
 * Displays a compact, scrollable list of provided sources with a numeric badge, title (or hostname fallback), source type chip ("Web" or "KB"), a short content preview, and the source hostname. Shows a "Web fallback" badge when any source has `sourceType === 'web'`.
 *
 * @param sources - Array of citation sources to display. Links with non-HTTP/HTTPS URLs are rendered inert (href set to `#` and navigation prevented); valid `http`/`https` URLs open in a new tab.
 * @returns A JSX element containing the sources panel, or `null` when `sources` is empty.
 */
export function CitationPanel({ sources }: Props) {
  if (sources.length === 0) return null;
  const hasWebFallback = sources.some(source => source.sourceType === 'web');

  return (
    <aside className='w-[360px] shrink-0 overflow-y-auto border-l border-white/45 bg-background/80 p-4 backdrop-blur-sm animate-in slide-in-from-right-8 duration-300 dark:border-white/10'>
      <div className='surface-glass rounded-2xl p-4'>
        <div className='mb-4 flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <h3 className='text-sm font-semibold'>Sources</h3>
            {hasWebFallback && (
              <span className='rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary'>
                Web fallback
              </span>
            )}
          </div>
          <span className='flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary'>
            {sources.length}
          </span>
        </div>
        <div className='space-y-2.5'>
          {sources.map((source, i) => {
            const safeHref = getSafeHref(source.url);
            const domain = getSourceHostname(source.url);
            return (
              <a
                key={i}
                href={safeHref ?? '#'}
                target='_blank'
                rel='noopener noreferrer'
                onClick={safeHref ? undefined : (event) => event.preventDefault()}
                className='group block rounded-xl border border-white/65 bg-background/85 p-3.5 no-underline transition hover:border-primary/40 hover:bg-background'
              >
                <div className='mb-2 flex items-start justify-between gap-2'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span className='flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/12 text-[10px] font-mono font-bold text-primary'>
                      {i + 1}
                    </span>
                    <h4 className='line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-primary'>
                      {source.title ?? domain}
                    </h4>
                  </div>
                  <span className='shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground'>
                    {source.sourceType === 'web' ? 'Web' : 'KB'}
                  </span>
                </div>
                <p className='line-clamp-3 text-xs leading-relaxed text-muted-foreground'>
                  {cleanSourcePreview(source.content, 120)}
                </p>
                <span className='mt-2 block font-mono text-[10px] text-primary/70'>
                  {domain}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
