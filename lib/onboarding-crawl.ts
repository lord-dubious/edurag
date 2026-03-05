import { tavily } from '@tavily/core';
import { env } from '@/lib/env';
import { getMongoCollection } from '@/lib/vectorstore';
import { getEmbeddings } from '@/lib/providers';
import { cleanContent, extractTitle } from '@/lib/crawl';
import { DEFAULT_CRAWL_INSTRUCTIONS } from '@/lib/constants';

export interface OnboardingCrawlProgress {
    phase: 'preparing' | 'crawling' | 'embedding' | 'storing' | 'complete' | 'error';
    message: string;
    pagesFound: number;
    pagesProcessed: number;
    chunksCreated: number;
    docsStored: number;
    currentUrl?: string;
    error?: string;
}

export interface FileTypeRules {
    pdf: 'index' | 'skip';
    docx: 'index' | 'skip';
    csv: 'index' | 'skip';
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
    const effectiveOverlap = overlap >= chunkSize ? Math.floor(chunkSize / 4) : overlap;
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        if (end === text.length) break;
        start = end - effectiveOverlap;
    }
    return chunks;
}

function shouldSkipFile(url: string, fileTypeRules: FileTypeRules): boolean {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.endsWith('.pdf') && fileTypeRules.pdf === 'skip') return true;
    if ((lowerUrl.endsWith('.docx') || lowerUrl.endsWith('.doc')) && fileTypeRules.docx === 'skip') return true;
    if (lowerUrl.endsWith('.csv') && fileTypeRules.csv === 'skip') return true;
    return false;
}

const BINARY_EXTENSIONS = new Set([
    '.zip', '.exe', '.dmg', '.apk', '.iso',
    '.tar', '.gz', '.tgz', '.rar', '.7z', '.bin', '.dll', '.so',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico',
    '.woff', '.woff2', '.ttf', '.eot',
]);

function isBinaryFile(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return [...BINARY_EXTENSIONS].some(ext => lowerUrl.endsWith(ext));
}

export interface OnboardingCrawlOptions {
    universityUrl: string;
    externalUrls?: string[];
    excludePaths?: string[];
    crawlConfig?: { maxDepth?: number; maxBreadth?: number; limit?: number };
    fileTypeRules?: FileTypeRules;
    crawlerInstructions?: string;
    onProgress?: (update: OnboardingCrawlProgress) => void;
    signal?: AbortSignal;
}

export async function runOnboardingCrawl(opts: OnboardingCrawlOptions): Promise<number> {
    const {
        universityUrl,
        externalUrls = [],
        excludePaths = [],
        crawlConfig = { maxDepth: 3, limit: 300 },
        fileTypeRules = { pdf: 'index', docx: 'index', csv: 'skip' },
        crawlerInstructions = '',
        onProgress,
        signal,
    } = opts;

    if (!env.EMBEDDING_API_KEY) throw new Error('Embedding API key is required');
    if (!env.TAVILY_API_KEY) throw new Error('Tavily API key is required');
    if (!env.MONGODB_URI) throw new Error('MongoDB URI is required');

    const maxDepth = crawlConfig.maxDepth ?? 3;
    const maxBreadth = crawlConfig.maxBreadth ?? 50;
    const limit = crawlConfig.limit ?? 300;

    const tvly = tavily({ apiKey: env.TAVILY_API_KEY });
    const embeddingsInstance = getEmbeddings(env.EMBEDDING_API_KEY, env.EMBEDDING_MODEL, env.EMBEDDING_DIMENSIONS);

    let totalChunks = 0;
    let totalDocs = 0;
    let totalPages = 0;
    const allUrls = [universityUrl, ...externalUrls];

    onProgress?.({
        phase: 'preparing',
        message: 'Starting crawl...',
        pagesFound: allUrls.length,
        pagesProcessed: 0,
        chunksCreated: 0,
        docsStored: 0,
    });

    for (let i = 0; i < allUrls.length; i++) {
        signal?.throwIfAborted();

        const baseUrl = allUrls[i];
        const isExternal = i > 0;

        onProgress?.({
            phase: 'crawling',
            message: `Crawling ${isExternal ? 'external source' : 'university site'}...`,
            pagesFound: allUrls.length,
            pagesProcessed: i,
            chunksCreated: totalChunks,
            docsStored: totalDocs,
            currentUrl: baseUrl,
        });

        try {
            const excludePatterns = excludePaths.map((p: string) =>
                p.startsWith('/') ? `${baseUrl}${p}` : p
            );

            const crawlResult = await tvly.crawl(
                baseUrl,
                {
                    maxDepth: isExternal ? 1 : maxDepth,
                    maxBreadth: isExternal ? 20 : maxBreadth,
                    limit: isExternal ? 50 : limit,
                    extractDepth: 'basic',
                    instructions: crawlerInstructions || DEFAULT_CRAWL_INSTRUCTIONS,
                    excludePaths: excludePatterns.length > 0 ? excludePatterns : undefined,
                }
            );

            if (!crawlResult.results || crawlResult.results.length === 0) {
                onProgress?.({
                    phase: 'crawling',
                    message: 'No pages found',
                    pagesFound: allUrls.length,
                    pagesProcessed: i,
                    chunksCreated: totalChunks,
                    docsStored: totalDocs,
                    currentUrl: baseUrl,
                });
                continue;
            }

            const collection = await getMongoCollection('crawled_index');

            for (const page of crawlResult.results) {
                signal?.throwIfAborted();

                if (!page.url || !page.rawContent) continue;

                if (isBinaryFile(page.url)) {
                    console.log(`Skipping binary file: ${page.url}`);
                    continue;
                }

                if (shouldSkipFile(page.url, fileTypeRules)) {
                    continue;
                }

                const cleaned = cleanContent(page.rawContent);
                if (cleaned.length < 100) continue;

                const title = extractTitle(page.rawContent, page.url) || page.url.split('/').pop() || 'Untitled';
                const rawChunks = chunkText(cleaned, 1500, 300);
                const chunks = rawChunks.filter((c: string) => c.trim().length > 50);

                if (chunks.length === 0) continue;

                totalChunks += chunks.length;

                onProgress?.({
                    phase: 'embedding',
                    message: `Embedding ${chunks.length} chunks...`,
                    pagesFound: allUrls.length,
                    pagesProcessed: i,
                    chunksCreated: totalChunks,
                    docsStored: totalDocs,
                    currentUrl: page.url,
                });

                const documents = [];
                let embeddingsArray: number[][] | undefined;
                try {
                    embeddingsArray = await embeddingsInstance.embedDocuments(chunks);
                } catch (embedError) {
                    console.error(`Embedding failed for ${page.url}:`, embedError);
                    continue;
                }

                if (!embeddingsArray || embeddingsArray.length !== chunks.length) continue;

                for (let j = 0; j < chunks.length; j++) {
                    documents.push({
                        content: chunks[j],
                        url: page.url,
                        title,
                        sourceType: isExternal ? 'external' : 'university',
                        chunkIndex: j,
                        totalChunks: chunks.length,
                        embedding: embeddingsArray[j],
                        crawledAt: new Date(),
                        updatedAt: new Date(),
                    });
                }

                if (documents.length > 0) {
                    await collection.insertMany(documents, { ordered: false });
                    totalDocs += documents.length;
                    totalPages++;

                    onProgress?.({
                        phase: 'storing',
                        message: `Stored ${documents.length} chunks from ${title}`,
                        pagesFound: allUrls.length,
                        pagesProcessed: i,
                        chunksCreated: totalChunks,
                        docsStored: totalDocs,
                        currentUrl: page.url,
                    });
                }
            }
        } catch (crawlError) {
            console.error(`Error crawling ${baseUrl}:`, crawlError);
            onProgress?.({
                phase: 'error',
                message: 'Crawl failed for this source',
                pagesFound: allUrls.length,
                pagesProcessed: i,
                chunksCreated: totalChunks,
                docsStored: totalDocs,
                currentUrl: baseUrl,
                error: crawlError instanceof Error ? crawlError.message : String(crawlError),
            });
        }
    }

    onProgress?.({
        phase: 'complete',
        message: `Crawl complete! Indexed ${totalDocs} chunks from ${totalPages} pages.`,
        pagesFound: totalPages,
        pagesProcessed: totalPages,
        chunksCreated: totalChunks,
        docsStored: totalDocs,
    });

    return totalDocs;
}
