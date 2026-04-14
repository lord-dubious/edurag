import { isIP } from 'node:net';
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

const MAX_LIVE_CONTENT_BYTES = 512 * 1024;

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

function isPrivateIPv4Address(hostname: string): boolean {
  const parts = hostname.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a >= 224) {
    return true;
  }

  return false;
}

function isPrivateIPv6Address(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === '::1' || normalized === '::') {
    return true;
  }
  if (normalized.startsWith('fe80:')) {
    return true;
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  if (normalized.startsWith('::ffff:')) {
    const mappedIPv4 = normalized.slice('::ffff:'.length);
    return isIP(mappedIPv4) !== 4 || isPrivateIPv4Address(mappedIPv4);
  }

  return false;
}

function isDisallowedHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (
    normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized === '169.254.169.254' ||
    normalized === 'metadata.google.internal'
  ) {
    return true;
  }

  if (
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.localhost')
  ) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIPv4Address(normalized);
  }
  if (ipVersion === 6) {
    return isPrivateIPv6Address(normalized);
  }

  return !normalized.includes('.');
}

function isFetchableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return !isDisallowedHostname(parsed.hostname);
  } catch {
    return false;
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

async function readResponseTextWithLimit(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Response body exceeded ${maxBytes} bytes`);
    }

    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

function buildBlockedUrlResult(
  source: IndexedSource,
  finalUrl: string,
  checkedWith: 'HEAD' | 'GET',
): SourceVerificationResult {
  return {
    url: source.url,
    finalUrl,
    title: source.title,
    chunkCount: source.chunkCount,
    statusCode: null,
    checkedWith,
    linkStatus: 'error',
    contentStatus: 'unknown',
    error: 'Blocked private or non-public source URL',
  };
}

async function verifySource(source: IndexedSource, timeoutMs: number): Promise<SourceVerificationResult> {
  let checkedWith: 'HEAD' | 'GET' = 'HEAD';
  let statusCode: number | null = null;
  let finalUrl = source.url;
  let linkStatus: LinkStatus = 'error';
  let contentStatus: ContentStatus = 'unknown';
  let error: string | undefined;

  if (!isFetchableUrl(source.url)) {
    return buildBlockedUrlResult(source, source.url, 'HEAD');
  }

  let shouldRunGet = true;

  try {
    const headResponse = await requestWithTimeout(source.url, 'HEAD', timeoutMs);
    statusCode = headResponse.status;
    finalUrl = headResponse.url || source.url;
    if (!isFetchableUrl(finalUrl)) {
      return buildBlockedUrlResult(source, finalUrl, 'HEAD');
    }
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
      if (!isFetchableUrl(finalUrl)) {
        return buildBlockedUrlResult(source, finalUrl, 'GET');
      }
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
        const liveContent = await readResponseTextWithLimit(getResponse, MAX_LIVE_CONTENT_BYTES);
        contentStatus = compareContent(source.sampleContent, liveContent);
      } else {
        if (getResponse.body) {
          await getResponse.body.cancel().catch(() => undefined);
        }
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
