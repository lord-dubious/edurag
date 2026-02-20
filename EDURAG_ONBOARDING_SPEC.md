# EduRAG — University Onboarding: Feature Spec & Technical Plan

> **What this document covers:** How the one-time dev setup flow works, how brand detection is orchestrated, and how the app switches between "first run" and "live" mode. Built on the existing EduRAG stack: Next.js 15, Tavily JS, MongoDB Atlas, Sharp, Vercel AI SDK, AI Elements, shadcn/ui.

---

## 1. Trigger: When does onboarding show?

The app checks for a configured university on every cold start. The logic lives in `middleware.ts` and a server-side check in the root layout.

```ts
// lib/onboarding.ts
export function isOnboarded(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_UNI_URL &&
    process.env.BRAND_PRIMARY &&
    process.env.NEXT_PUBLIC_APP_NAME
  );
}
```

```ts
// app/layout.tsx (server component)
import { isOnboarded } from '@/lib/onboarding';
import { redirect } from 'next/navigation';

export default function RootLayout({ children }) {
  if (!isOnboarded()) {
    redirect('/setup');          // → shows onboarding UI
  }
  return <html>...</html>;
}
```

```ts
// middleware.ts — protect /setup from being visible post-onboarding
export function middleware(request: NextRequest) {
  const onboarded = !!(process.env.NEXT_PUBLIC_UNI_URL);

  if (request.nextUrl.pathname.startsWith('/setup') && onboarded) {
    return NextResponse.redirect(new URL('/', request.url));
  }
  // ... existing admin protection
}
```

**Onboarding route:** `app/setup/page.tsx` — a client component that renders the 5-step wizard. Not linked anywhere in the public app. Accessible only when env vars are missing.

---

## 2. Step-by-step flow

```
Step 1: University URL
  └─ Dev enters https://university.edu
  └─ Clicks "Detect" → POST /api/onboarding/detect

Step 2: Brand confirmation
  └─ Displays extracted logo, favicon, colours
  └─ Dev selects primary colour → live preview updates

Step 3: Crawl scope
  └─ Path sections pre-selected from Tavily sitemap
  └─ Dev configures depth, limit, instructions

Step 4: Crawl & index
  └─ POST /api/onboarding/crawl → SSE progress stream
  └─ Shows live log of pages crawled → chunks → vectors

Step 5: Review & launch
  └─ Summary + .env preview
  └─ "Launch" → POST /api/onboarding/save → writes .env.local
  └─ Redirects to / (now onboarded)
```

---

## 3. Brand Detection API

### Endpoint
```
POST /api/onboarding/detect
Body: { url: string }
Response: BrandPayload
```

### What it does (orchestration)

```ts
// app/api/onboarding/detect/route.ts
import { tavily } from '@tavily/core';
import sharp from 'sharp';

export async function POST(req: Request) {
  const { url } = await req.json();
  const client = tavily({ apiKey: env.TAVILY_API_KEY });

  // ── 1. Extract homepage content + images ──────────────
  const extract = await client.extract([url], {
    includeImages: true,
    includeFavicon: true,
    extractDepth: 'advanced',
    format: 'markdown',
  });

  const result = extract.results[0];

  // ── 2. Parse metadata from raw HTML (regex on rawContent) ─
  const ogImage   = parseOgImage(result.rawContent);
  const favicon   = result.favicon ?? `${new URL(url).origin}/favicon.ico`;
  const uniName   = parseOgTitle(result.rawContent) ?? new URL(url).hostname;

  // ── 3. Parse CSS custom properties from rawContent ─────
  // Looks for --color-*, --brand-*, --primary, --accent patterns
  const cssColors = parseCssTokens(result.rawContent);

  // ── 4. Extract dominant colour from logo via Sharp ─────
  let dominantColors: string[] = [];
  const imageUrl = ogImage ?? favicon;
  if (imageUrl) {
    try {
      const imgRes  = await fetch(imageUrl);
      const imgBuf  = Buffer.from(await imgRes.arrayBuffer());
      const { dominant, channels } = await sharp(imgBuf).stats();

      // dominant gives the single most frequent colour
      dominantColors.push(rgbToHex(dominant.r, dominant.g, dominant.b));

      // Also sample from channels means for secondary tones
      const r2 = Math.round(channels[0].mean);
      const g2 = Math.round(channels[1].mean);
      const b2 = Math.round(channels[2].mean);
      dominantColors.push(rgbToHex(r2, g2, b2));
    } catch (_) {
      // Gracefully skip if image can't be fetched
    }
  }

  // ── 5. Collect all images from page for colour sampling ─
  const pageImages = result.images?.slice(0, 3) ?? [];
  for (const imgUrl of pageImages) {
    try {
      const res    = await fetch(imgUrl);
      const buf    = Buffer.from(await res.arrayBuffer());
      const { dominant } = await sharp(buf).stats();
      dominantColors.push(rgbToHex(dominant.r, dominant.g, dominant.b));
    } catch (_) {}
  }

  // ── 6. Merge and deduplicate colour candidates ─────────
  const allColors = dedupeColors([
    ...cssColors,
    ...dominantColors,
  ]).slice(0, 6); // max 6 swatches

  // ── 7. Discover site sections via Tavily crawl (shallow) ─
  // 1 level deep, just to find /admissions /academics etc.
  const sitemap = await client.crawl(url, {
    max_depth: 1,
    limit: 30,
    instructions: 'Find main navigation sections: admissions, academics, tuition, housing, student life, research, departments, events',
  });

  const sections = discoverSections(sitemap.results.map(r => r.url), url);

  return Response.json({
    uniName,
    favicon,
    ogImage,
    colors: allColors,
    sections,
  } satisfies BrandPayload);
}
```

### Helper functions

```ts
// lib/onboarding/brand.ts

export function parseCssTokens(html: string): string[] {
  // Match CSS custom property values that look like hex colours
  const re = /--(color|brand|primary|accent|theme)[^:]*:\s*(#[0-9a-fA-F]{3,8})/g;
  const colors: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    colors.push(normalizeHex(m[2]));
  }
  return [...new Set(colors)];
}

export function parseOgImage(html: string): string | null {
  const m = html.match(/og:image['"]\s+content=['"]([^'"]+)['"]/);
  return m?.[1] ?? null;
}

export function parseOgTitle(html: string): string | null {
  const m = html.match(/og:site_name['"]\s+content=['"]([^'"]+)['"]/);
  return m?.[1] ?? null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

export function discoverSections(urls: string[], baseUrl: string): string[] {
  const base = new URL(baseUrl).origin;
  const known = ['admissions','academics','programs','tuition','financial-aid','housing','student-life','research','departments','events','about'];
  return urls
    .filter(u => u.startsWith(base))
    .map(u => new URL(u).pathname.split('/').filter(Boolean)[0])
    .filter((p, i, arr) => p && known.includes(p) && arr.indexOf(p) === i)
    .slice(0, 10);
}

export function dedupeColors(colors: string[]): string[] {
  // Remove colours too close to white/black, dedupe visually similar
  return colors
    .filter(c => {
      const { r, g, b } = hexToRgb(c);
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness > 30 && brightness < 220; // skip near-black/white
    })
    .filter((c, i, arr) => arr.findIndex(x => colorDistance(x, c) < 30) === i);
}

export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a), rb = hexToRgb(b);
  return Math.sqrt((ra.r-rb.r)**2 + (ra.g-rb.g)**2 + (ra.b-rb.b)**2);
}
```

---

## 4. Crawl & Index API (SSE)

Same pattern as the existing `/api/crawl` route, but scoped to the onboarding setup:

```ts
// app/api/onboarding/crawl/route.ts
export async function POST(req: Request) {
  const { uniUrl, sections, depth, limit, instructions } = await req.json();
  const client = tavily({ apiKey: env.TAVILY_API_KEY });

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      let totalDocs = 0;

      for (const section of sections) {
        const sectionUrl = `${new URL(uniUrl).origin}/${section}`;
        send({ type: 'status', message: `Starting crawl: ${sectionUrl}` });

        const crawlResult = await client.crawl(sectionUrl, {
          max_depth: depth,
          limit,
          instructions,
        });

        for (const page of crawlResult.results) {
          send({ type: 'progress', page: page.url, total: crawlResult.results.length });

          // Split → embed → store
          const docs = await crawlAndVectorize(page, uniUrl, {
            onChunk: (n) => send({ type: 'chunk', count: n }),
          });
          totalDocs += docs;
          send({ type: 'indexed', docs: totalDocs });
        }
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

---

## 5. Brand → CSS injection at runtime

After the dev selects a primary colour and saves:

```ts
// lib/brand.ts
export function buildCssVars(primary: string): Record<string, string> {
  const { r, g, b } = hexToRgb(primary);
  const light = `rgba(${r},${g},${b},0.08)`;
  const glow  = `rgba(${r},${g},${b},0.12)`;
  const mid   = darkenHex(primary, 15);

  return {
    '--accent':        primary,
    '--accent-mid':    mid,
    '--accent-light':  light,
    '--accent-glow':   glow,
  };
}
```

```ts
// app/layout.tsx (server component)
import { buildCssVars } from '@/lib/brand';

const cssVars = process.env.BRAND_PRIMARY
  ? buildCssVars(process.env.BRAND_PRIMARY)
  : {};

export default function RootLayout({ children }) {
  return (
    <html style={cssVars}>        {/* CSS vars injected at HTML root */}
      ...
    </html>
  );
}
```

All EduRAG components already use `var(--accent)` — so the entire UI inherits the university colour with zero component changes.

---

## 6. Save configuration

```ts
// app/api/onboarding/save/route.ts
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function POST(req: Request) {
  const { uniName, uniUrl, brandPrimary, brandLogoUrl } = await req.json();

  const envContent = [
    `# EduRAG — generated by onboarding wizard ${new Date().toISOString()}`,
    `NEXT_PUBLIC_APP_NAME="${uniName} EduRAG"`,
    `NEXT_PUBLIC_APP_URL="https://your-domain.vercel.app"`,
    `NEXT_PUBLIC_UNI_URL="${uniUrl}"`,
    `BRAND_PRIMARY="${brandPrimary}"`,
    `BRAND_LOGO_URL="${brandLogoUrl}"`,
    ``,
    `# Add your API keys below`,
    `CHAT_API_KEY=""`,
    `CHAT_BASE_URL=""`,
    `CHAT_MODEL=""`,
    `EMBEDDING_API_KEY=""`,
    `EMBEDDING_BASE_URL=""`,
    `EMBEDDING_MODEL=""`,
    `EMBEDDING_DIMENSIONS="2048"`,
    `MONGODB_URI=""`,
    `DB_NAME="edurag"`,
    `TAVILY_API_KEY=""`,
    `ADMIN_SECRET=""`,
    `FAQ_THRESHOLD="5"`,
  ].join('\n');

  // Write to .env.local in project root
  // NOTE: This only works in local dev (Node.js process has fs access)
  // For Vercel: show the env block and link to vercel.com/settings
  writeFileSync(join(process.cwd(), '.env.local'), envContent, 'utf-8');

  return Response.json({ ok: true });
}
```

> **Vercel note:** On Vercel, `writeFileSync` won't persist. Instead, the onboarding wizard outputs the env block for the dev to copy into their Vercel project settings. The UI shows a "Copy .env" button that copies the content to clipboard.

---

## 7. University mode detection (runtime)

Beyond onboarding, the app also uses the env vars to adapt at runtime:

```ts
// lib/env.ts (additions to existing schema)
export const env = createEnv({
  server: {
    // ... existing vars
    BRAND_PRIMARY:    z.string().optional().default('#1e4d2b'),
    BRAND_LOGO_URL:   z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().default('EduRAG'),
    NEXT_PUBLIC_UNI_URL:  z.string().url().optional(),
  },
});
```

```ts
// lib/onboarding.ts
export const uniConfig = {
  name:      env.NEXT_PUBLIC_APP_NAME,
  url:       env.NEXT_PUBLIC_UNI_URL,
  logoUrl:   env.BRAND_LOGO_URL,
  primary:   env.BRAND_PRIMARY,
  isSetup:   !!(env.NEXT_PUBLIC_UNI_URL && env.BRAND_PRIMARY),
} as const;
```

Used in agent system prompt:
```ts
// lib/agent/prompts.ts
export const AGENT_SYSTEM_PROMPT = `
You are a helpful assistant for ${uniConfig.name}.
You have access to the official knowledge base from ${uniConfig.url}.
...
`;
```

---

## 8. Packages needed

```bash
# Already in stack
npm install @tavily/core sharp

# New (colour utilities)
npm install chroma-js
# or use the manual helpers in lib/onboarding/brand.ts (no extra dep needed)
```

```json
// package.json additions
{
  "dependencies": {
    "@tavily/core": "^0.6.0",
    "sharp": "^0.33.0"
  }
}
```

---

## 9. File structure

```
app/
  setup/
    page.tsx              ← 5-step onboarding wizard (client component)
    layout.tsx            ← Minimal layout, no header/sidebar
  api/
    onboarding/
      detect/route.ts     ← POST: extract brand from URL
      crawl/route.ts      ← POST: crawl & index with SSE progress
      save/route.ts       ← POST: write .env.local

lib/
  onboarding/
    brand.ts              ← parseCssTokens, rgbToHex, dedupeColors, buildCssVars
    detect.ts             ← orchestration logic (called by route)
    index.ts              ← isOnboarded(), uniConfig exports

components/
  onboarding/
    StepUrl.tsx           ← Step 1 UI
    StepBrand.tsx         ← Step 2 UI (colour picker + live preview)
    StepScope.tsx         ← Step 3 UI (section pills + crawl config)
    StepCrawling.tsx      ← Step 4 UI (SSE progress consumer)
    StepReview.tsx        ← Step 5 UI (summary + .env block + launch)
    OnboardingShell.tsx   ← Left panel + step tracker
```

---

## 10. AI Elements & shadcn component mapping for wizard

| Wizard element | shadcn / AI Elements |
|---|---|
| Step tracker (left panel) | Custom (no library needed — simple divs) |
| URL input | `shadcn/ui: Input` |
| "Detect" button | `shadcn/ui: Button` |
| Colour swatches | Custom radio-group (no library needed) |
| Live preview | Custom (injected CSS vars) |
| Section pills | `shadcn/ui: ToggleGroup` |
| Crawl config selects | `shadcn/ui: Select` |
| Crawl instructions | `shadcn/ui: Textarea` |
| SSE progress bar | `shadcn/ui: Progress` |
| Live crawl log | Custom (scrolling `<pre>` or `<div>`) |
| Env block (review) | `shadcn/ui: ScrollArea` wrapping `<code>` |
| Copy to clipboard | `shadcn/ui: Button` + `navigator.clipboard` |
| Toast notifications | `shadcn/ui: useToast()` + `<Toaster>` |
| Callout boxes | `shadcn/ui: Alert` + `AlertDescription` |

---

## 11. Limitations & edge cases

| Situation | Handling |
|---|---|
| University uses a CDN with no `--color-*` tokens | Falls back to Sharp dominant colour from og:image or favicon |
| No og:image or favicon | Renders placeholder cap icon; dev can upload logo manually |
| Tavily can't reach URL (auth wall, bot blocking) | Error callout on Step 1; dev proceeds without detection and sets brand manually |
| Vercel deployment | writeFileSync skipped; show "copy to clipboard" + link to vercel.com/settings |
| Re-running onboarding | `/setup?reset=true` clears state and re-runs (admin only) |
| Colour too dark/light | `dedupeColors()` filters near-black/white; always at least 1 usable colour |

---

## 12. Sequencing summary

```
1. Dev clones repo, runs npm install
2. No .env.local → next dev redirects to /setup

3. /setup Step 1:
   Dev enters https://university.edu
   → POST /api/onboarding/detect
     → tavily.extract(url, { includeImages, includeFavicon, extractDepth:'advanced' })
     → sharp(faviconBuffer).stats() → dominant colour
     → parseCssTokens(rawContent) → brand colour tokens
     → tavily.crawl(url, { max_depth:1 }) → section discovery
   ← BrandPayload { uniName, favicon, colors[], sections[] }

4. /setup Step 2:
   Dev views colour swatches + preview
   Selects primary colour → CSS vars live-update in browser

5. /setup Step 3:
   Dev picks sections, depth, limit, instructions

6. /setup Step 4:
   → POST /api/onboarding/crawl (SSE)
     → For each section:
       tavily.crawl(sectionUrl, { max_depth, limit, instructions })
       → RecursiveCharacterTextSplitter (1000t / 200 overlap)
       → embeddings (configured model)
       → MongoDBAtlasVectorStore.addDocuments()
   ← SSE events: status | progress | indexed | complete

7. /setup Step 5:
   Dev reviews summary + .env block
   → POST /api/onboarding/save
     → writeFileSync('.env.local') [local dev]
     → or clipboard copy [Vercel]
   → Redirect to / (isOnboarded() now returns true)
   → app/layout.tsx injects CSS vars from BRAND_PRIMARY
   → All components inherit university colour automatically
```

---

*This document is part of the EduRAG architecture. See also: `EDURAG_ARCHITECTURE.md` for full stack reference, `edurag-onboarding.html` for the UI design reference, `edurag-student.html` for the public student portal UI.*
