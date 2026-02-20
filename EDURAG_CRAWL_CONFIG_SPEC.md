# EduRAG — Crawl Configuration: Extended Spec

> **Scope:** Covers the four new capabilities added to the onboarding wizard (Step 3) and admin dashboard: external URL sources, excluded paths, file-type exclusions, and per-domain rule storage.

---

## 1. External URLs (non-university domains)

### What it is
Any public URL that isn't the university's own domain — federal student aid sites, partner institution handbooks, government regulation pages, etc.

### In the wizard
Step 3 → Section B: dev adds URL + label pairs. Each becomes a separate crawl job with `allowExternal: true` on its own isolated job (not inherited by the uni domain crawl).

### Implementation

```ts
// lib/crawl/runExternalCrawl.ts
export async function runExternalCrawl(
  entry: { url: string; label: string },
  splitter: RecursiveCharacterTextSplitter,
  vectorStore: MongoDBAtlasVectorStore
) {
  const client = tavily({ apiKey: env.TAVILY_API_KEY });

  // External crawls: shallow by default, no domain restriction
  const result = await client.crawl(entry.url, {
    max_depth: 2,
    limit: 50,
    allowExternal: true,           // key difference vs uni domain crawls
    extractDepth: 'advanced',
    format: 'markdown',
    instructions: `Index the most useful student-facing content from ${entry.url}`,
  });

  for (const page of result.results) {
    const doc = {
      pageContent: page.rawContent,
      metadata: {
        source:     page.url,
        sourceType: 'external',    // distinguishes in admin dashboard
        label:      entry.label,
        baseUrl:    entry.url,
        indexedAt:  new Date().toISOString(),
      }
    };
    const chunks = await splitter.splitDocuments([doc]);
    await vectorStore.addDocuments(chunks);
  }
}
```

### Onboarding save route

```ts
// POST /api/onboarding/crawl — adds external jobs after uni section jobs
const externals = body.externals as Array<{ url: string; label: string }>;
for (const ext of externals) {
  send({ type: 'status', message: `Crawling external: ${ext.label} — ${ext.url}` });
  await runExternalCrawl(ext, splitter, vectorStore);
  send({ type: 'external_done', label: ext.label });
}
```

### Admin dashboard
External sources show up in the All Sources table with `type: "external"` badge. The Web Crawl form has an `allowExternal` toggle per-domain. Admins can add external URLs at any time from the Web Crawl page — no different from any other domain.

---

## 2. Excluded paths

### What it is
A global blocklist of path prefixes. Any URL matching these prefixes is skipped by every crawl job, across all domains, unless a per-domain rule overrides it.

### In the wizard
Step 3 → Section C: tag-style input. Defaults pre-populated: `/admin`, `/login`, `/portal`, `/cms`, `/api`, `/cdn`. Devs add custom paths before starting the crawl.

### How Tavily consumes it

```ts
await client.crawl(startUrl, {
  excludePaths: state.excludePaths,  // ['admin', '/login', '/portal', '/cms', '/api']
  // ...rest of config
});
```

Tavily prefix-matches these — `/login` blocks `/login`, `/login/saml`, `/login/student` etc.

### Storage in MongoDB

```ts
// Written during POST /api/onboarding/save as part of global CrawlRules doc
const globalRules: CrawlRules = {
  selectPaths:    selectedSections.map(s => s.path),
  excludePaths:   body.excludePaths,      // from wizard Section C
  excludeDomains: [],
  allowExternal:  false,
  indexLinkedPdfs:  body.fileTypeRules.pdf === 'index',
  indexLinkedDocx:  body.fileTypeRules.docx === 'index',
  weeklyReschedule: false,
  skipUnchanged:    true,
  fileTypeRules:    body.fileTypeRules,
};

await db.collection('crawl_rules').replaceOne(
  { _id: 'global' },
  globalRules,
  { upsert: true }
);
```

### Applied in every subsequent crawl

```ts
// lib/crawl/buildConfig.ts
export async function buildCrawlConfig(
  perCrawl: Partial<CrawlConfig>
): Promise<CrawlConfig> {
  const global = await db.collection('crawl_rules').findOne({ _id: 'global' });

  return {
    ...perCrawl,
    // Union: per-crawl paths appended to global rules
    excludePaths: [
      ...(global?.excludePaths ?? []),
      ...(perCrawl.excludePaths ?? []),
    ],
    selectPaths: perCrawl.selectPaths ?? global?.selectPaths ?? [],
    allowExternal: perCrawl.allowExternal ?? global?.allowExternal ?? false,
  };
}
```

---

## 3. File-type exclusions

### What it is
Control what the crawler does when it encounters a link to a PDF, DOCX, or CSV during a web crawl. Options per type: `index` (download + parse + embed) or `skip`.

### In the wizard
Step 3 → Section D: radio buttons per file type. Defaults: PDF → index, DOCX → index, CSV → skip, binary → always skip.

### Runtime behaviour in the crawl route

```ts
// app/api/crawl/route.ts (inside page loop)
const rules = await getCrawlRules();

for (const page of result.results) {
  // Check if this URL is a file link
  const ext = getExtension(page.url);

  if (ext === 'pdf' && rules.fileTypeRules.pdf === 'index') {
    await ingestRemoteFile(page.url, 'pdf', vectorStore, splitter);
    continue;
  }
  if (['docx','doc'].includes(ext) && rules.fileTypeRules.docx === 'index') {
    await ingestRemoteFile(page.url, 'docx', vectorStore, splitter);
    continue;
  }
  if (ext === 'csv' && rules.fileTypeRules.csv === 'index') {
    await ingestRemoteFile(page.url, 'csv', vectorStore, splitter);
    continue;
  }
  if (['png','jpg','jpeg','gif','mp4','zip','exe'].includes(ext)) {
    continue; // always skip binary
  }

  // Normal HTML page — index rawContent
  const chunks = await splitter.splitDocuments([{
    pageContent: page.rawContent,
    metadata: { source: page.url, sourceType: 'web', ... }
  }]);
  await vectorStore.addDocuments(chunks);
}

function getExtension(url: string): string {
  try { return new URL(url).pathname.split('.').pop()?.toLowerCase() ?? ''; }
  catch { return ''; }
}
```

### `ingestRemoteFile` (shared with upload route)

```ts
// lib/ingest/remoteFile.ts
export async function ingestRemoteFile(
  url: string,
  ext: string,
  vectorStore: MongoDBAtlasVectorStore,
  splitter: RecursiveCharacterTextSplitter
) {
  const res = await fetch(url);
  if (!res.ok) return;
  const buf = Buffer.from(await res.arrayBuffer());
  const tmp = join(tmpdir(), `${nanoid()}.${ext}`);
  await writeFile(tmp, buf);

  let loader;
  if (ext === 'pdf')             loader = new PDFLoader(tmp);
  else if (ext === 'docx')       loader = new DocxLoader(tmp);
  else if (ext === 'csv')        loader = new CSVLoader(tmp);
  else                           loader = new TextLoader(tmp);

  const docs = await loader.load();
  await unlink(tmp);

  const withMeta = docs.map(d => ({
    ...d,
    metadata: {
      ...d.metadata,
      source:     url,
      sourceType: 'document',
      crawledFrom: url,
      indexedAt:  new Date().toISOString(),
    }
  }));
  const chunks = await splitter.splitDocuments(withMeta);
  await vectorStore.addDocuments(chunks);
}
```

---

## 4. Per-domain crawl rules

### What it is
Each domain crawled from the admin Web Crawl page can override the global rules with its own `selectPaths`, `excludePaths`, `allowExternal`, `maxDepth`, `limit`, and `instructions`. Global rules are the fallback; per-domain rules win when set.

### Storage schema

```ts
// lib/db/types.ts
interface DomainCrawlRule {
  _id:           string;       // the domain, e.g. "university.edu/research"
  baseUrl:       string;
  selectPaths?:  string[];
  excludePaths?: string[];
  allowExternal?: boolean;
  maxDepth?:     number;
  limit?:        number;
  extractDepth?: 'basic' | 'advanced';
  instructions?: string;
  fileTypeRules?: { pdf: 'index'|'skip'; docx: 'index'|'skip'; csv: 'index'|'skip' };
  createdAt:     string;
  lastCrawledAt?: string;
}
```

### Writing on crawl submit

```ts
// POST /api/crawl — saves per-domain rule before starting job
const domainRule: DomainCrawlRule = {
  _id:          new URL(body.startUrl).hostname + new URL(body.startUrl).pathname,
  baseUrl:      body.startUrl,
  selectPaths:  body.selectPaths,
  excludePaths: body.excludePaths,
  allowExternal: body.allowExternal,
  maxDepth:     body.maxDepth,
  limit:        body.limit,
  instructions: body.instructions,
  fileTypeRules: body.fileTypeRules,
  createdAt:    existingRule?.createdAt ?? new Date().toISOString(),
};

await db.collection('domain_crawl_rules').replaceOne(
  { _id: domainRule._id },
  domainRule,
  { upsert: true }
);
```

### `buildCrawlConfig` with per-domain merge

```ts
// lib/crawl/buildConfig.ts
export async function buildCrawlConfig(
  startUrl: string,
  perCrawlOverrides: Partial<CrawlConfig>
): Promise<CrawlConfig> {
  const global = await db.collection('crawl_rules').findOne({ _id: 'global' });
  const domainKey = new URL(startUrl).hostname + new URL(startUrl).pathname;
  const perDomain = await db.collection('domain_crawl_rules').findOne({ _id: domainKey });

  // Priority: perCrawlOverrides > perDomain > global
  return {
    maxDepth:     perCrawlOverrides.maxDepth     ?? perDomain?.maxDepth     ?? global?.defaultDepth   ?? 2,
    limit:        perCrawlOverrides.limit        ?? perDomain?.limit        ?? global?.defaultLimit   ?? 100,
    instructions: perCrawlOverrides.instructions ?? perDomain?.instructions ?? '',
    allowExternal:perCrawlOverrides.allowExternal?? perDomain?.allowExternal?? global?.allowExternal  ?? false,

    // Paths: union of global + per-domain + per-crawl
    selectPaths:  [
      ...(global?.selectPaths   ?? []),
      ...(perDomain?.selectPaths  ?? []),
      ...(perCrawlOverrides.selectPaths ?? []),
    ],
    excludePaths: [
      ...(global?.excludePaths  ?? []),
      ...(perDomain?.excludePaths ?? []),
      ...(perCrawlOverrides.excludePaths ?? []),
    ],

    // File types: per-domain overrides global
    fileTypeRules: {
      ...global?.fileTypeRules,
      ...perDomain?.fileTypeRules,
    },
  };
}
```

### Admin UI
The Web Crawl page shows the configured path filters inline (tag inputs). On submit it POSTs the full config, which saves as a domain rule and immediately starts the crawl job. The Crawl Rules page shows and edits the **global** defaults only. Per-domain overrides are visible if you click a source row in All Sources.

---

## 5. What gets saved during onboarding

`POST /api/onboarding/save` writes three things:

```ts
// 1. .env.local (or clipboard for Vercel)
NEXT_PUBLIC_APP_NAME="MIT EduRAG"
NEXT_PUBLIC_UNI_URL="https://mit.edu"
BRAND_PRIMARY="#A31F34"
BRAND_LOGO_URL="https://mit.edu/favicon.ico"

// 2. MongoDB: global crawl rules document
db.collection('crawl_rules').replaceOne({ _id: 'global' }, {
  selectPaths:    ['/admissions', '/academics', '/tuition'],
  excludePaths:   ['/admin', '/login', '/portal', '/cms', '/api', '/cdn'],
  excludeDomains: [],
  allowExternal:  false,
  indexLinkedPdfs:  true,
  indexLinkedDocx:  true,
  fileTypeRules: { pdf: 'index', docx: 'index', csv: 'skip' },
  weeklyReschedule: false,
  skipUnchanged:    true,
}, { upsert: true });

// 3. MongoDB: per-domain rule for the university root
db.collection('domain_crawl_rules').insertMany([
  { _id: 'mit.edu/admissions', baseUrl: 'https://mit.edu/admissions', maxDepth: 2, limit: 100, ... },
  { _id: 'mit.edu/academics',  baseUrl: 'https://mit.edu/academics',  maxDepth: 2, limit: 100, ... },
  { _id: 'studentaid.gov/understand-aid', baseUrl: 'https://studentaid.gov/...', allowExternal: true, ... },
]);
```

After this, `isOnboarded()` returns `true` and the app redirects to `/`.

---

*See also: `EDURAG_CONTENT_SOURCES_SPEC.md` for upload/manual entry pipelines, `EDURAG_ONBOARDING_SPEC.md` for the full onboarding flow, `edurag-onboarding-v2.html` for the updated wizard UI.*
