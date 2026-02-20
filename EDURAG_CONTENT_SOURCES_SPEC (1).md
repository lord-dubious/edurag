# EduRAG — Knowledge Base Content Sources: Spec & Implementation

> **What this covers:** Every way content gets into the vector store beyond the initial onboarding crawl — document uploads, manual text entries, full-site crawls, and crawl exceptions. All routes use the same chunking → embedding → MongoDB Atlas pipeline.

---

## 1. Content source types

| Type | Input | LangChain loader | Route |
|---|---|---|---|
| Web crawl | URL | Tavily crawl API | `POST /api/crawl` |
| PDF | File upload | `PDFLoader` | `POST /api/ingest/file` |
| Word doc | File upload | `DocxLoader` | `POST /api/ingest/file` |
| Plain text / MD | File upload | `TextLoader` | `POST /api/ingest/file` |
| CSV | File upload | `CSVLoader` | `POST /api/ingest/file` |
| Manual entry | Admin textarea | Direct string | `POST /api/ingest/manual` |

All six types go through the same final pipeline:

```
raw content
  → RecursiveCharacterTextSplitter (1000t / 200 overlap)
  → embedding model
  → MongoDBAtlasVectorStore.addDocuments()
```

---

## 2. Document upload pipeline

### API route

```ts
// app/api/ingest/file/route.ts
import { PDFLoader }  from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import { CSVLoader }  from '@langchain/community/document_loaders/fs/csv';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { nanoid } from 'nanoid';
import { getVectorStore } from '@/lib/vectorstore';

export async function POST(req: Request) {
  const form = await req.formData();
  const file  = form.get('file') as File;
  const tags  = JSON.parse(form.get('tags') as string ?? '[]');
  const title = form.get('title') as string;
  const chunkSize    = Number(form.get('chunkSize') ?? 1000);
  const chunkOverlap = Number(form.get('chunkOverlap') ?? 200);

  // 1. Write to temp file (loaders need fs path)
  const ext     = file.name.split('.').pop()?.toLowerCase() ?? 'txt';
  const tmpPath = join(tmpdir(), `${nanoid()}.${ext}`);
  await writeFile(tmpPath, Buffer.from(await file.arrayBuffer()));

  // 2. Pick loader by extension
  const loader = pickLoader(tmpPath, ext);
  const rawDocs = await loader.load();

  // 3. Clean up temp file immediately
  await unlink(tmpPath);

  // 4. Attach metadata to every document
  const docsWithMeta = rawDocs.map(doc => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      source:    title || file.name,
      sourceType: 'document',
      fileName:   file.name,
      tags,
      indexedAt: new Date().toISOString(),
    }
  }));

  // 5. Split
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize, chunkOverlap });
  const chunks   = await splitter.splitDocuments(docsWithMeta);

  // 6. Embed + store
  const vectorStore = await getVectorStore();
  await vectorStore.addDocuments(chunks);

  return Response.json({ ok: true, chunks: chunks.length, source: file.name });
}

function pickLoader(path: string, ext: string) {
  switch (ext) {
    case 'pdf':  return new PDFLoader(path);
    case 'docx':
    case 'doc':  return new DocxLoader(path);
    case 'csv':  return new CSVLoader(path);
    case 'txt':
    case 'md':
    default:     return new TextLoader(path);
  }
}
```

### Packages

```bash
npm install @langchain/community @langchain/textsplitters
# PDFLoader uses pdf-parse internally — already a peer dep
```

### Frontend (shadcn + AI Elements)

```tsx
// components/admin/UploadDocs.tsx
import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';

export function UploadDocs() {
  const { toast } = useToast();

  const onDrop = useCallback(async (files: File[]) => {
    for (const file of files) {
      const form = new FormData();
      form.append('file', file);
      form.append('tags', JSON.stringify(['uploaded']));
      form.append('title', file.name);

      const res = await fetch('/api/ingest/file', { method: 'POST', body: form });
      const { chunks } = await res.json();

      toast({ title: `${file.name} indexed`, description: `${chunks} chunks created` });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt', '.md'],
      'text/csv': ['.csv'],
    },
    maxSize: 50 * 1024 * 1024, // 50 MB
  });

  return (
    <div {...getRootProps()} className={`drop-zone ${isDragActive ? 'active' : ''}`}>
      <input {...getInputProps()} />
      <p>Drop PDF, DOCX, TXT, MD, or CSV files here</p>
    </div>
  );
}
```

---

## 3. Manual text entry pipeline

```ts
// app/api/ingest/manual/route.ts
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { getVectorStore } from '@/lib/vectorstore';

export async function POST(req: Request) {
  const { title, content, source, tags, chunkSize, chunkOverlap } = await req.json();

  const doc = new Document({
    pageContent: content,
    metadata: {
      source:     source || 'manual',
      sourceType: 'manual',
      title,
      tags:       tags ?? [],
      indexedAt:  new Date().toISOString(),
    }
  });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize:    chunkSize    ?? 1000,
    chunkOverlap: chunkOverlap ?? 200,
  });
  const chunks = await splitter.splitDocuments([doc]);

  const vectorStore = await getVectorStore();
  await vectorStore.addDocuments(chunks);

  return Response.json({ ok: true, chunks: chunks.length });
}
```

The admin UI sends a `PATCH /api/ingest/manual/:id` for edits — this deletes all chunks with `metadata.manualId === id` from MongoDB then re-indexes the updated content.

---

## 4. Crawl with full-site support + exceptions

### Tavily crawl parameters (full reference)

```ts
// lib/crawl/types.ts
export interface CrawlConfig {
  startUrl:       string;

  // Depth & breadth
  maxDepth?:      number;           // default 2. Set high (e.g. 10) for "crawl everything"
  limit?:         number;           // default 100. Set null/undefined for no limit (use with care)
  maxBreadth?:    number;           // max links to follow per page per level

  // Natural language guidance
  instructions?:  string;           // e.g. "Focus on student-facing content, skip staff portals"

  // Path filtering — all are prefix-matched
  selectPaths?:   string[];         // ONLY crawl URLs matching these prefixes
  excludePaths?:  string[];         // ALWAYS skip these paths
  selectDomains?: string[];         // only follow links to these domains
  excludeDomains?:string[];         // never follow links to these domains
  allowExternal?: boolean;          // follow links leaving the base domain (default false)

  // Output
  extractDepth?:  'basic' | 'advanced';  // default 'advanced'
  format?:        'markdown' | 'text';   // default 'markdown'
  includeImages?: boolean;               // default false for indexing
}
```

### Full-site crawl

To crawl everything on a domain:

```ts
const config: CrawlConfig = {
  startUrl:    'https://university.edu',
  maxDepth:    10,            // go deep
  limit:       1000,          // raise page cap
  instructions:'Index all student-facing content across the entire university website',
  excludePaths: [
    '/admin', '/login', '/portal', '/cms', '/wp-admin',
    '/api', '/cdn', '/assets', '/static',
  ],
  allowExternal: false,
};
```

> **Cost note:** A no-limit full-site crawl on a large university site can return 2,000–10,000 pages. At Tavily's pricing, set a realistic `limit` and use `instructions` to focus the crawl rather than crawling blindly.

### Crawl route with SSE

```ts
// app/api/crawl/route.ts
import { tavily } from '@tavily/core';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { getVectorStore } from '@/lib/vectorstore';

export async function POST(req: Request) {
  const config: CrawlConfig = await req.json();
  const client = tavily({ apiKey: env.TAVILY_API_KEY });

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      send({ type: 'status', message: `Starting crawl: ${config.startUrl}` });

      const result = await client.crawl(config.startUrl, {
        max_depth:       config.maxDepth      ?? 2,
        limit:           config.limit         ?? 100,
        instructions:    config.instructions,
        selectPaths:     config.selectPaths,
        excludePaths:    config.excludePaths,
        selectDomains:   config.selectDomains,
        excludeDomains:  config.excludeDomains,
        allowExternal:   config.allowExternal ?? false,
        extractDepth:    config.extractDepth  ?? 'advanced',
        format:          config.format        ?? 'markdown',
      });

      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const vectorStore = await getVectorStore();
      let totalDocs = 0;

      for (const page of result.results) {
        send({ type: 'progress', url: page.url, done: totalDocs, total: result.results.length });

        // Also check for linked PDFs/DOCX in rawContent
        const linkedFiles = extractFileLinks(page.rawContent, page.url);
        for (const fileUrl of linkedFiles) {
          await ingestRemoteFile(fileUrl, vectorStore, splitter);
          send({ type: 'file', url: fileUrl });
        }

        const doc = {
          pageContent: page.rawContent,
          metadata: {
            source:     page.url,
            sourceType: 'web',
            baseUrl:    config.startUrl,
            indexedAt:  new Date().toISOString(),
          }
        };

        const chunks = await splitter.splitDocuments([doc]);
        await vectorStore.addDocuments(chunks);
        totalDocs += chunks.length;

        send({ type: 'indexed', docs: totalDocs });
      }

      send({ type: 'complete', totalDocs });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Ingesting PDF/DOCX links found during crawl

```ts
// lib/crawl/ingestRemoteFile.ts
async function ingestRemoteFile(url: string, vectorStore, splitter) {
  const ext = url.split('.').pop()?.toLowerCase();
  if (!['pdf','docx','doc'].includes(ext ?? '')) return;

  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = join(tmpdir(), `${nanoid()}.${ext}`);
  await writeFile(tmp, buf);

  const loader = ext === 'pdf' ? new PDFLoader(tmp) : new DocxLoader(tmp);
  const docs   = await loader.load();
  await unlink(tmp);

  const withMeta = docs.map(d => ({
    ...d,
    metadata: { ...d.metadata, source: url, sourceType: 'document', crawledFrom: url }
  }));
  const chunks = await splitter.splitDocuments(withMeta);
  await vectorStore.addDocuments(chunks);
}
```

---

## 5. Global crawl rules — storage & application

Rules are stored in MongoDB, not env vars, so they can be edited from the admin UI:

```ts
// lib/db/crawlRules.ts
export interface CrawlRules {
  selectPaths:    string[];   // global allowlist
  excludePaths:   string[];   // global blocklist
  excludeDomains: string[];
  allowExternal:  boolean;
  indexLinkedPdfs: boolean;
  indexLinkedDocx: boolean;
  weeklyReschedule: boolean;
  skipUnchanged:  boolean;
  fileTypeRules: {
    pdf:  'index' | 'skip' | 'linkOnly';
    docx: 'index' | 'skip';
    txt:  'index' | 'skip';
  };
}

// Fetch from DB and merge with per-crawl overrides
export async function buildCrawlConfig(
  perCrawl: Partial<CrawlConfig>,
  global: CrawlRules
): Promise<CrawlConfig> {
  return {
    ...perCrawl,
    // Per-crawl paths are ADDED to global rules (union)
    selectPaths:   [...(global.selectPaths  ?? []), ...(perCrawl.selectPaths  ?? [])],
    excludePaths:  [...(global.excludePaths ?? []), ...(perCrawl.excludePaths ?? [])],
    excludeDomains:[...(global.excludeDomains ?? []), ...(perCrawl.excludeDomains ?? [])],
    // Per-crawl boolean overrides take precedence
    allowExternal: perCrawl.allowExternal ?? global.allowExternal,
  };
}
```

---

## 6. Deleting sources from the vector store

MongoDB Atlas vector store supports filtering by metadata. Deleting a source means removing all chunks where `metadata.source` matches:

```ts
// app/api/sources/[id]/route.ts — DELETE
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const db = await getDb();
  const collection = db.collection(env.MONGODB_COLLECTION);

  // Delete all chunks where source matches
  const result = await collection.deleteMany({
    'metadata.source': decodeURIComponent(params.id)
  });

  return Response.json({ ok: true, deleted: result.deletedCount });
}
```

---

## 7. Metadata schema on every chunk

Every chunk stored in MongoDB Atlas includes:

```ts
interface ChunkMetadata {
  source:      string;    // URL, filename, or 'manual'
  sourceType:  'web' | 'document' | 'manual';
  title?:      string;    // document title or page <title>
  baseUrl?:    string;    // root domain for web crawls
  fileName?:   string;    // original filename for uploads
  tags?:       string[];  // admin-assigned tags for filtering
  manualId?:   string;    // nanoid for manual entries (for edit/delete)
  indexedAt:   string;    // ISO timestamp
  chunkIndex?: number;    // position within source document
}
```

This metadata enables:
- **Source filtering in agent tool calls** — `{ filter: { 'metadata.tags': { $in: ['financial-aid'] } } }`
- **Selective re-indexing** — delete all chunks by source, re-crawl, re-add
- **Citations in the chat UI** — `metadata.source` is the URL or filename shown to the student

---

## 8. Summary: how it all connects

```
Admin adds content via any of:
  ├─ Web Crawl page     → POST /api/crawl (Tavily, SSE)
  ├─ Upload Docs page   → POST /api/ingest/file (LangChain loaders)
  ├─ Manual Entry page  → POST /api/ingest/manual (Document object)
  └─ All Sources page   → DELETE /api/sources/:id (remove chunks)
              ↓
All paths feed into:
  RecursiveCharacterTextSplitter
              ↓
  Embedding model (configured via env)
              ↓
  MongoDBAtlasVectorStore.addDocuments()
              ↓
  Student asks question → agent retrieves top-k chunks
  across ALL source types simultaneously (no separation needed)
```

---

*See also: `EDURAG_ARCHITECTURE.md` for full stack, `EDURAG_ONBOARDING_SPEC.md` for first-run setup, `edurag-admin-kb.html` for the admin UI design reference.*
