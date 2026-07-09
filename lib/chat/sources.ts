import type { Source } from '@edurag/agent/text';

interface SearchOutputPartLike {
  type: string;
  state?: unknown;
  output?: unknown;
}

export function extractSourcesFromSearchParts(parts: SearchOutputPartLike[]): {
  sources: Source[];
  usedWebFallback: boolean;
} {
  const sources: Source[] = [];
  const seenSourceKeys = new Set<string>();
  let usedWebFallback = false;

  parts.forEach((part) => {
    if (
      (part.type !== 'tool-vector_search' && part.type !== 'tool-web_search') ||
      part.state !== 'output-available'
    ) {
      return;
    }

    const results = typeof part.output === 'object' && part.output !== null
      ? (part.output as { results?: unknown }).results
      : undefined;
    if (!Array.isArray(results)) {
      return;
    }

    const sourceType: Source['sourceType'] = part.type === 'tool-web_search' ? 'web' : 'vector';

    results.forEach((result) => {
      if (typeof result !== 'object' || result === null) {
        return;
      }

      const candidate = result as Record<string, unknown>;
      const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
      const content = typeof candidate.content === 'string' ? candidate.content.trim() : '';

      if (!url || !content) {
        return;
      }

      const title = typeof candidate.title === 'string' && candidate.title.trim().length > 0
        ? candidate.title.trim()
        : undefined;
      const score = typeof candidate.score === 'number' && Number.isFinite(candidate.score)
        ? candidate.score
        : undefined;

      const sourceKey = `${sourceType}:${url}:${title ?? ''}:${content}`;
      if (seenSourceKeys.has(sourceKey)) {
        return;
      }

      seenSourceKeys.add(sourceKey);
      sources.push({
        url,
        title,
        content,
        score,
        sourceType,
      });
      usedWebFallback = usedWebFallback || sourceType === 'web';
    });
  });

  return { sources, usedWebFallback };
}

export function getSafeHref(url: string): string | null {
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

export function getSourceHostname(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname || 'source';
  } catch {
    return 'source';
  }
}

export function cleanSourcePreview(content: string, maxLength = 150): string {
  if (!content) {
    return 'Content preview not available';
  }

  let cleaned = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#__*~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= 30) {
    return 'Content preview not available';
  }

  const hasNavPattern = /[A-Z][a-z]+&[A-Z]/.test(cleaned) ||
    /[A-Z][a-z]+[A-Z][a-z]+[A-Z]/.test(cleaned.slice(0, 100)) ||
    cleaned.includes('Services Services') ||
    cleaned.includes('All Services') ||
    cleaned.includes('Academic & Student Success');

  if (hasNavPattern) {
    const meaningfulMatch = cleaned.match(/(?:St\.? Lawrence College|offers?|programs?|students?|campus|admission|tuition|international|diploma|bachelor|certificate|degree)[^.]{20,100}\./i);
    if (meaningfulMatch) {
      cleaned = meaningfulMatch[0];
    } else {
      return 'View page for details';
    }
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  const truncated = cleaned.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
}
