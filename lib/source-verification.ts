import { env } from './env';
import { getMongoCollection } from './vectorstore';

type LinkStatus = 'ok' | 'redirected' | 'restricted' | 'dead' | 'error';
type ContentStatus = 'match' | 'mismatch' | 'unknown';

interface IndexedSource {
  url: string;
  title?: string;
  sampleContent: string;
  chunkCount: number;
}

export interface SourceVerificationResult {
  url: string;
  finalUrl: string;
  title?: string;
  chunkCount: number;
  statusCode: number | null;
  checkedWith: 'HEAD' | 'GET';
  linkStatus: LinkStatus;
  contentStatus: ContentStatus;
  error?: string;
}

export interface SourceVerificationSummary {
  threadId?: string;
  scannedDocuments: number;
  uniqueSources: number;
  checkedSources: number;
  ok: number;
  redirected: number;
  restricted: number;
  dead: number;
  errors: number;
  contentMatch: number;
  contentMismatch: number;
  contentUnknown: number;
  generatedAt: string;
}

export interface VerifyIndexedSourcesResult {
  summary: SourceVerificationSummary;
  results: SourceVerificationResult[];
}

export interface VerifyIndexedSourcesOptions {
  threadId?: string;
  maxUrls?: number;
  maxDocsToScan?: number;
  timeoutMs?: number;
  concurrency?: number;
}

interface VectorDoc {
  text?: unknown;
  pageContent?: unknown;
  metadata?: unknown;
  threadId?: unknown;
}

function normalizeUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function normalizeText(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildSnippet(sampleContent: string): string {
  const normalized = normalizeText(sampleContent);
  if (normalized.length < 60) {
    return '';
  }
  return normalized.slice(0, 220);
}

function getLinkStatusFromCode(statusCode: number): LinkStatus {
  if (statusCode >= 200 && statusCode < 300) {
    return 'ok';
  }
  if (statusCode === 401 || statusCode === 403) {
    return 'restricted';
  }
  if (statusCode === 404 || statusCode === 410) {
    return 'dead';
  }
  return 'error';
}

function compareContent(sampleContent: string, liveContent: string): ContentStatus {
  const sampleSnippet = buildSnippet(sampleContent);
  if (!sampleSnippet) {
    return 'unknown';
  }

  const live = normalizeText(liveContent);
  if (!live) {
    return 'unknown';
  }

  const tokens = sampleSnippet
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 4)
    .slice(0, 35);

  if (tokens.length < 8) {
    return 'unknown';
  }

  const matched = tokens.filter(token => live.includes(token)).length;
  return matched / tokens.length >= 0.6 ? 'match' : 'mismatch';
}

async function requestWithTimeout(url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'EduRAG-SourceVerifier/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function verifySource(source: IndexedSource, timeoutMs: number): Promise<SourceVerificationResult> {
  let checkedWith: 'HEAD' | 'GET' = 'HEAD';
  let statusCode: number | null = null;
  let finalUrl = source.url;
  let linkStatus: LinkStatus = 'error';
  let contentStatus: ContentStatus = 'unknown';
  let error: string | undefined;

  let shouldRunGet = true;

  try {
    const headResponse = await requestWithTimeout(source.url, 'HEAD', timeoutMs);
    statusCode = headResponse.status;
    finalUrl = headResponse.url || source.url;
    linkStatus = getLinkStatusFromCode(headResponse.status);
    if (headResponse.redirected && linkStatus === 'ok' && finalUrl !== source.url) {
      linkStatus = 'redirected';
    }

    if (headResponse.status === 405 || headResponse.status === 501) {
      shouldRunGet = true;
    } else if (linkStatus === 'dead' || linkStatus === 'restricted') {
      shouldRunGet = false;
    }
  } catch (err) {
    shouldRunGet = true;
    error = err instanceof Error ? err.message : String(err);
  }

  if (shouldRunGet) {
    checkedWith = 'GET';

    try {
      const getResponse = await requestWithTimeout(source.url, 'GET', timeoutMs);
      statusCode = getResponse.status;
      finalUrl = getResponse.url || finalUrl;
      linkStatus = getLinkStatusFromCode(getResponse.status);
      if (getResponse.redirected && linkStatus === 'ok' && finalUrl !== source.url) {
        linkStatus = 'redirected';
      }

      const contentType = (getResponse.headers.get('content-type') || '').toLowerCase();
      const shouldCompareContent = getResponse.ok && (
        contentType.includes('text/html') ||
        contentType.includes('text/plain') ||
        contentType.includes('application/json') ||
        contentType.includes('application/xml')
      );

      if (shouldCompareContent) {
        const liveContent = await getResponse.text();
        contentStatus = compareContent(source.sampleContent, liveContent);
      } else {
        contentStatus = 'unknown';
      }
      error = undefined;
    } catch (err) {
      if (!statusCode) {
        statusCode = null;
      }
      linkStatus = 'error';
      contentStatus = 'unknown';
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    url: source.url,
    finalUrl,
    title: source.title,
    chunkCount: source.chunkCount,
    statusCode,
    checkedWith,
    linkStatus,
    contentStatus,
    error,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const workers = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workers }).map(async () => {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await mapper(items[current]);
    }
  }));

  return results;
}

function buildThreadQuery(threadId?: string): Record<string, unknown> {
  if (!threadId) {
    return {};
  }

  return {
    $or: [
      { threadId },
      { 'metadata.threadId': threadId },
    ],
  };
}

function toIndexedSources(docs: VectorDoc[], maxUrls: number): IndexedSource[] {
  const grouped = new Map<string, IndexedSource>();

  docs.forEach((doc) => {
    const metadata = (typeof doc.metadata === 'object' && doc.metadata !== null)
      ? doc.metadata as Record<string, unknown>
      : {};

    const rawUrl = typeof metadata.url === 'string'
      ? metadata.url
      : (typeof metadata.baseUrl === 'string' ? metadata.baseUrl : '');
    const url = normalizeUrl(rawUrl);
    if (!url) {
      return;
    }

    const title = typeof metadata.title === 'string' && metadata.title.trim().length > 0
      ? metadata.title.trim()
      : undefined;
    const sampleContent = typeof doc.text === 'string'
      ? doc.text
      : (typeof doc.pageContent === 'string'
        ? doc.pageContent
        : (typeof metadata.content === 'string' ? metadata.content : ''));

    const existing = grouped.get(url);
    if (existing) {
      existing.chunkCount += 1;
      if (!existing.sampleContent && sampleContent) {
        existing.sampleContent = sampleContent;
      }
      if (!existing.title && title) {
        existing.title = title;
      }
      return;
    }

    grouped.set(url, {
      url,
      title,
      sampleContent: sampleContent || '',
      chunkCount: 1,
    });
  });

  return Array.from(grouped.values())
    .sort((a, b) => b.chunkCount - a.chunkCount)
    .slice(0, maxUrls);
}

export async function verifyIndexedSources(options: VerifyIndexedSourcesOptions = {}): Promise<VerifyIndexedSourcesResult> {
  const threadId = options.threadId;
  const maxUrls = Math.max(1, Math.min(options.maxUrls ?? 120, 500));
  const maxDocsToScan = Math.max(1, Math.min(options.maxDocsToScan ?? 5000, 50000));
  const timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? 8000, 30000));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 20));

  const collection = await getMongoCollection<VectorDoc>(env.VECTOR_COLLECTION);
  const docs = await collection
    .find(buildThreadQuery(threadId), {
      projection: {
        text: 1,
        pageContent: 1,
        metadata: 1,
        threadId: 1,
      },
      sort: { _id: -1 },
      limit: maxDocsToScan,
    })
    .toArray();

  const indexedSources = toIndexedSources(docs, maxUrls);
  const results = await mapWithConcurrency(indexedSources, concurrency, async (source) =>
    verifySource(source, timeoutMs),
  );

  const summary: SourceVerificationSummary = {
    threadId,
    scannedDocuments: docs.length,
    uniqueSources: indexedSources.length,
    checkedSources: results.length,
    ok: results.filter(r => r.linkStatus === 'ok').length,
    redirected: results.filter(r => r.linkStatus === 'redirected').length,
    restricted: results.filter(r => r.linkStatus === 'restricted').length,
    dead: results.filter(r => r.linkStatus === 'dead').length,
    errors: results.filter(r => r.linkStatus === 'error').length,
    contentMatch: results.filter(r => r.contentStatus === 'match').length,
    contentMismatch: results.filter(r => r.contentStatus === 'mismatch').length,
    contentUnknown: results.filter(r => r.contentStatus === 'unknown').length,
    generatedAt: new Date().toISOString(),
  };

  return {
    summary,
    results,
  };
}
