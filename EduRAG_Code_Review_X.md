# EduRAG — Complete Remediation Plan v3
> **Repos reviewed:** `lord-dubious/edurag` (main app) · `lord-dubious/edurag-agent` (agent package)  
> **Review method:** Full source clone + line-by-line read of every `.ts` / `.tsx` file in both repos  
> **Document version:** 3.0 — replaces all prior versions  
> **Purpose:** Hand this directly to a coding agent. Every issue is confirmed against real code, every fix is specified precisely enough to implement without further analysis.

---

## How to Read This Document

- **§1** — Master issue table with severity and which repo owns the fix
- **§2** — All fixes for `lord-dubious/edurag` (main app), grouped by priority tier
- **§3** — All fixes for `lord-dubious/edurag-agent` (agent package)
- **§4** — New issues discovered in v3 (not in previous review)
- **§5** — What is already correct (do not touch)

Severity scale: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🟢 LOW

---

## §1 — Master Issue Table

| ID | Repo | File(s) | Issue | Sev |
|----|------|---------|-------|-----|
| **M-01** | main | `app/api/voice-token/route.ts` | Returns raw `DEEPGRAM_API_KEY` to unauthenticated callers | 🔴 |
| **M-02** | main | `app/api/onboarding/complete/route.ts` | `GET` handler returns all raw API keys (MongoDB URI, CHAT_API_KEY, EMBEDDING_API_KEY, TAVILY_API_KEY) with zero auth | 🔴 |
| **M-03** | main | `app/api/onboarding/status/route.ts` | Returns full `settings` object including `uploadthingSecret`, `uploadthingAppId`, and all brand config with zero auth | 🔴 |
| **M-04** | main | `app/admin/login/page.tsx` | Admin cookie set via `document.cookie` with no `HttpOnly`, `Secure`, or `SameSite` flags — JS-readable | 🔴 |
| **M-05** | main | `app/api/auth/register/route.ts` | Open self-registration — anyone can create an account, no gate | 🔴 |
| **M-06** | main | `app/api/onboarding/crawl/route.ts` | Completely unauthenticated — anyone can trigger a full crawl | 🔴 |
| **M-07** | main | `app/api/startup/route.ts` | Passes `EMBEDDING_API_KEY`, `TAVILY_API_KEY`, and `MONGODB_URI` as request body fields to a sub-request | 🔴 |
| **M-08** | main | `app/api/crawl/route.ts` | SSRF: `z.string().url()` accepts `http://localhost`, RFC-1918 ranges, `file://` — no IP/protocol guard | 🔴 |
| **M-09** | main | `middleware.ts` · `lib/admin-auth.ts` · `app/admin/layout.tsx` | All three use `===` to compare `ADMIN_SECRET` — timing-unsafe, brute-forceable | 🟠 |
| **M-10** | main | `app/admin/login/page.tsx` | Login validates token via a real `GET /api/domains` call — side-channel auth | 🟠 |
| **M-11** | main | `app/api/startup/route.ts` | Accepts undocumented `ADMIN_TOKEN` env alias; reads `process.env` directly, bypassing Zod `min(16)` | 🟠 |
| **M-12** | main | `app/api/voice-function/route.ts` | No authentication — anyone can enumerate the vector store | 🟠 |
| **M-13** | main | `app/api/chat/route.ts` | No per-IP or per-session rate limiting | 🟠 |
| **M-14** | main | `auth.ts` + `middleware.ts` + `lib/admin-auth.ts` | Two parallel auth systems — NextAuth for users, raw ADMIN_SECRET for admin | 🟠 |
| **M-15** | main | `lib/vectorstore.ts` + `lib/auth-client.ts` | Two separate MongoDB singleton implementations creating two connection pools | 🟠 |
| **M-16** | main | `lib/conversation.ts` | `listConversations()` fetches all users' conversations with no filter | 🟠 |
| **M-17** | main | `lib/faq-manager.ts` | `synthesizeFaqAnswer` has no try/catch — on failure, every subsequent request retries indefinitely | 🟠 |
| **M-18** | main | `app/admin/knowledge-base/page.tsx` · `app/admin/settings/page.tsx` | Server actions (`'use server'`) have no independent auth check — rely solely on layout's UI guard | 🟠 |
| **M-19** | main | `lib/crawl.ts` vs `app/api/onboarding/crawl/route.ts` | Incompatible vector document schemas in same collection: LangChain `text` key vs manual `content` key | 🟡 |
| **M-20** | main | `lib/conversation.ts` | `appendMessage` uses findOne + conditional insert — race condition on first concurrent message to same thread | 🟡 |
| **M-21** | main | `lib/faq-manager.ts` | Secondary synthesis race: two concurrent requests at exact threshold both see `!result.answer` | 🟡 |
| **M-22** | main | `lib/crawl.ts` | No `AbortSignal` — crawl continues after client disconnects, wasting Tavily + embedding credits | 🟡 |
| **M-23** | main | `lib/crawl.ts` | Re-crawl inserts duplicate vectors — no content-hash deduplication | 🟡 |
| **M-24** | main | `lib/vectorstore.ts` | `broadK = Math.max(k * 4, 25)` has no upper ceiling | 🟡 |
| **M-25** | main | `lib/title-generator.ts` | `TITLE_MODEL = 'llama3.1-8b'` hardcoded — bypasses the chat model configured in settings | 🟡 |
| **M-26** | main | `app/api/onboarding/detect/route.ts` | Accepts explicit `http://` URLs — only upgrades scheme when no scheme present | 🟡 |
| **M-27** | main | `__tests__/*.test.ts` | All integration tests run against real production MongoDB with real API credits | 🟡 |
| **M-28** | main | `lib/env.ts` | `CHAT_CONTEXT_LENGTH`, `VOYAGEAI_API_KEY` in `.env.example` but absent from Zod schema — silently ignored | 🟢 |
| **M-29** | main | `lib/env.ts` | `COLLECTION2`/`COLLECTION3` (`checkpoints_aio`) are LangGraph leftovers — no LangGraph code exists | 🟢 |
| **M-30** | main | `lib/conversation.ts` | No unique index enforced on `threadId` in `conversations` collection | 🟢 |
| **M-31** | main | `package.json` | `deepgram-voice-interaction-react` installed from a GitHub commit hash — not a versioned npm release | 🟢 |
| **M-32** | main | `.agents/rules/AGENTS.md` | Still references `ADMIN_TOKEN` (old alias) — conflicts with `AGENTS.md` at root which uses `ADMIN_SECRET` | 🟢 |
| **A-01** | agent | `src/text/index.ts` | `void threadId` — param accepted in signature then immediately discarded, never used | 🟠 |
| **A-02** | agent | `src/text/index.ts` | `extraTools` spread has no collision guard — silently overwrites built-in tools on name conflict | 🟢 |
| **A-03** | agent | `src/text/prompts.ts` | FAQ synthesis prompt has no content guardrails — LLM hallucination goes directly to approval queue | 🟡 |
| **A-04** | agent | `src/voice/index.ts` | `stripMarkdownForVoice` uses fragile regex chain — fails on nested markdown and some edge cases | 🟡 |
| **A-05** | agent | `package.json` | Package is `private: true` but exported as a workspace package — version is `0.1.0` with no publish gate | 🟢 |

---

## §2 — Main App Repo (`lord-dubious/edurag`)

All fixes below are ordered: implement top-to-bottom. Each block is self-contained.

---

### TIER 1 — Fix Immediately (Data Exfiltration / Zero-Auth)

---

#### M-01 🔴 — `/api/voice-token` leaks master Deepgram key

**Confirmed location:** `app/api/voice-token/route.ts`

**Exact problem:**
```ts
export async function GET() {
  // No auth check at all
  return NextResponse.json({ apiKey: env.DEEPGRAM_API_KEY }); // master key in plaintext
}
```
Any person who visits this URL in a browser receives the master Deepgram API key. The client component `VoiceChat.tsx` calls this unconditionally on mount — even before the user starts a voice session.

**Required fix — two parts:**

Part 1: Make the route require authentication and issue a short-lived scoped token, not the master key.
```ts
// app/api/voice-token/route.ts — REPLACE ENTIRE FILE
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  if (!env.DEEPGRAM_API_KEY || !env.DEEPGRAM_PROJECT_ID) {
    return errorResponse('INTERNAL_ERROR', 'Voice not configured', 500);
  }
  try {
    const res = await fetch(
      `https://api.deepgram.com/v1/projects/${env.DEEPGRAM_PROJECT_ID}/keys`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: `session-${session.user.id}-${Date.now()}`,
          scopes: ['usage:write'],
          time_to_live_in_seconds: 90,
        }),
      },
    );
    if (!res.ok) throw new Error(`Deepgram key API returned ${res.status}`);
    const { key } = await res.json();
    return NextResponse.json({ apiKey: key });
  } catch (err) {
    console.error('[VoiceToken]', err);
    return errorResponse('INTERNAL_ERROR', 'Failed to issue voice token', 500);
  }
}
```

Part 2: Add `DEEPGRAM_PROJECT_ID` to `lib/env.ts` Zod schema:
```ts
DEEPGRAM_PROJECT_ID: z.string().min(1).optional(),
```

Part 3: Update `components/voice/VoiceChat.tsx` — only fetch the token when the user explicitly starts a voice session (move the `useEffect` fetch inside the `start` handler), not unconditionally on mount.

---

#### M-02 🔴 — `GET /api/onboarding/complete` returns all API keys unauthenticated

**Confirmed location:** `app/api/onboarding/complete/route.ts` lines 274–310

**Exact problem:**
```ts
export async function GET(): Promise<Response> {
  // No auth check
  return NextResponse.json({
    apiKeys: {
      mongodbUri: process.env.MONGODB_URI || '',       // full connection string with password
      chatApiKey: process.env.CHAT_API_KEY || '',       // plaintext
      embeddingApiKey: process.env.EMBEDDING_API_KEY || '', // plaintext
      tavilyApiKey: process.env.TAVILY_API_KEY || '',   // plaintext
      adminSecret: process.env.ADMIN_SECRET ? '****' : '',
    },
  });
}
```
This is the worst data leak in the codebase. The setup wizard uses this GET to pre-fill the form with existing values, but any unauthenticated visitor can call it.

**Required fix:**
```ts
// app/api/onboarding/complete/route.ts — replace the GET handler
export async function GET(): Promise<Response> {
  const settings = await getSettings();

  // Only return whether onboarding is complete and non-secret brand config.
  // Never return API keys. The setup wizard should check env vars server-side
  // before rendering, not fetch them via an unauthenticated API call.
  return NextResponse.json({
    isOnboarded: settings?.onboarded ?? false,
    uniUrl: settings?.uniUrl,
    brandPrimary: settings?.brandPrimary,
    brandSecondary: settings?.brandSecondary,
    emoji: settings?.emoji,
    iconType: settings?.iconType,
    showTitle: settings?.showTitle,
    appName: settings?.appName,
    hasAllEnvVars: hasRequiredEnvVars(),
    // apiKeys block REMOVED — never expose secrets via unauthenticated GET
  });
}
```

Also update `app/setup/page.tsx` — wherever it calls this GET to pre-fill API key inputs, replace with server-side `getSettings()` called directly in the RSC page component (not via fetch).

---

#### M-03 🔴 — `GET /api/onboarding/status` returns full settings object unauthenticated

**Confirmed location:** `app/api/onboarding/status/route.ts`

**Exact problem:**
```ts
export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    isOnboarded: settings?.onboarded ?? false,
    settings: settings,  // ← full document: includes uploadthingSecret, uploadthingAppId, etc.
    uniUrl: settings?.uniUrl,
    brandPrimary: settings?.brandPrimary,
    logoUrl: settings?.brandLogoUrl,
  });
}
```

**Required fix:**
```ts
// app/api/onboarding/status/route.ts — REPLACE ENTIRE FILE
import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/db/settings';
import { errorResponse } from '@/lib/errors';

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({
      isOnboarded: settings?.onboarded ?? false,
      uniUrl: settings?.uniUrl ?? null,
      brandPrimary: settings?.brandPrimary ?? null,
      logoUrl: settings?.brandLogoUrl ?? null,
      appName: settings?.appName ?? null,
      // Do NOT include: settings (full object), uploadthingSecret, uploadthingAppId
    });
  } catch (error) {
    return errorResponse('DB_ERROR', 'Failed to get onboarding status', 500, error);
  }
}
```

---

#### M-04 🔴 — Admin cookie set without security flags

**Confirmed location:** `app/admin/login/page.tsx`

**Exact problem:**
```ts
document.cookie = `admin_token=${token}; path=/; max-age=86400`;
// No HttpOnly — JS can read it (XSS steals it)
// No Secure — transmitted in plain text over HTTP
// No SameSite — CSRF possible
```

**Required fix — create a new server-side login route:**
```ts
// app/api/admin/login/route.ts — NEW FILE
import { timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { errorResponse } from '@/lib/errors';

export async function POST(req: Request) {
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Invalid JSON', 400);
  }

  const secret = env.ADMIN_SECRET;
  const token = body.token?.trim();

  if (!token || !secret) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) {
    return errorResponse('UNAUTHORIZED', 'Invalid token', 401);
  }

  const cookieStore = await cookies();
  cookieStore.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 8,
    path: '/',
  });
  return Response.json({ success: true });
}
```

**Update `app/admin/login/page.tsx`:**
```ts
// Replace the handleSubmit function — remove document.cookie
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      router.push('/admin');
    } else {
      setError('Invalid token');
    }
  } catch {
    setError('Authentication failed');
  } finally {
    setLoading(false);
  }
};
```

---

#### M-05 🔴 — Open self-registration

**Confirmed location:** `app/api/auth/register/route.ts` — no auth gate, open to internet

**Required fix:**
```ts
// app/api/auth/register/route.ts — add at top of POST handler
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true';

export async function POST(req: Request) {
  if (!ALLOW_REGISTRATION) {
    return errorResponse(
      'FORBIDDEN',
      'Self-registration is disabled. Contact an administrator.',
      403,
    );
  }
  // ... rest of existing code unchanged
}
```

Add to `.env.example`:
```
ALLOW_REGISTRATION=false   # Set to true only to create the first admin account
```

---

#### M-06 🔴 — `/api/onboarding/crawl` is unauthenticated

**Confirmed location:** `app/api/onboarding/crawl/route.ts` — first 10 lines go straight to crawl with no auth

**Required fix — add auth check as the very first statement in POST:**
```ts
// app/api/onboarding/crawl/route.ts — add immediately after imports
import { verifyAdmin } from '@/lib/admin-auth';

export async function POST(request: NextRequest): Promise<Response> {
  if (!verifyAdmin(request)) {
    return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  }
  // ... rest of existing code unchanged
}
```

Note: `verifyAdmin` must use `timingSafeEqual` — see M-09 for that fix. Implement M-09 first.

---

#### M-07 🔴 — API secrets passed as request body fields to sub-request

**Confirmed location:** `app/api/startup/route.ts` lines ~85–105

**Exact problem:**
```ts
const crawlResponse = await fetch(new URL('/api/onboarding/crawl', request.url), {
  body: JSON.stringify({
    apiKeys: {
      embeddingApiKey: process.env.EMBEDDING_API_KEY,  // in request body = in logs
      tavilyApiKey: process.env.TAVILY_API_KEY,         // in request body = in logs
      mongodbUri: process.env.MONGODB_URI,              // username:password in body = in logs
    },
  }),
});
```

**Required fix — extract the crawl logic into a shared module and call directly:**

```ts
// lib/onboarding-crawl.ts — NEW FILE
// Move the core crawl loop from app/api/onboarding/crawl/route.ts here.
// This function reads secrets from env directly — no parameters for secrets.
import { env } from './env';
import { tavily } from '@tavily/core';
import { getEmbeddings } from './providers';
import { getMongoCollection } from './vectorstore';
import { cleanContent, extractTitle } from './crawl';
import { DEFAULT_CRAWL_INSTRUCTIONS } from './constants';

export interface OnboardingCrawlOptions {
  universityUrl: string;
  externalUrls?: string[];
  excludePaths?: string[];
  crawlConfig?: { maxDepth?: number; maxBreadth?: number; limit?: number };
  crawlerInstructions?: string;
  onProgress?: (update: OnboardingCrawlProgress) => void;
  signal?: AbortSignal;
}

export interface OnboardingCrawlProgress {
  phase: string;
  message: string;
  docsStored: number;
}

export async function runOnboardingCrawl(opts: OnboardingCrawlOptions): Promise<number> {
  // All env vars read from env directly — none accepted as parameters
  const tvly = tavily({ apiKey: env.TAVILY_API_KEY });
  const embeddingsInstance = getEmbeddings(); // uses env.EMBEDDING_API_KEY internally
  // ... crawl logic moved here from the route handler
  return totalDocs;
}
```

```ts
// app/api/startup/route.ts — replace the fetch() sub-request with direct call
import { runOnboardingCrawl } from '@/lib/onboarding-crawl';

// Replace:
// const crawlResponse = await fetch(...)
// With:
await runOnboardingCrawl({
  universityUrl,
  crawlConfig: {
    maxDepth: env.CRAWL_MAX_DEPTH,
    maxBreadth: env.CRAWL_MAX_BREADTH,
    limit: env.CRAWL_LIMIT,
  },
  crawlerInstructions: env.CRAWL_INSTRUCTIONS,
});
```

Also update `app/api/onboarding/crawl/route.ts` to import and call `runOnboardingCrawl` instead of duplicating the logic. Remove the `apiKeys` parameter from the route body entirely.

---

#### M-08 🔴 — SSRF on crawl endpoint

**Confirmed location:** `app/api/crawl/route.ts` — `z.string().url()` is the only validation

**Required fix — add `assertSafeCrawlUrl` helper and call it before the Tavily request:**

```ts
// lib/crawl.ts — add this function before crawlAndVectorize

import { promises as dns } from 'dns';

async function assertSafeCrawlUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are permitted for crawling');
  }

  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(parsed.hostname, { all: true });
  } catch {
    throw new Error(`Cannot resolve hostname: ${parsed.hostname}`);
  }

  for (const { address } of addrs) {
    if (isPrivateOrReservedIP(address)) {
      throw new Error(`URL resolves to a private/reserved IP address: ${address}`);
    }
  }
}

function isPrivateOrReservedIP(ip: string): boolean {
  const patterns = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,
    /^0\./,
    /^::1$/,
    /^fc[0-9a-f]{2}:/i,
    /^fd[0-9a-f]{2}:/i,
    /^fe80:/i,
  ];
  return patterns.some(r => r.test(ip));
}
```

```ts
// app/api/crawl/route.ts — add at start of stream start() callback, before crawlAndVectorize
try {
  await assertSafeCrawlUrl(body.url);
} catch (err) {
  send({ type: 'error', message: err instanceof Error ? err.message : 'URL not permitted' });
  controller.close();
  return;
}
```

---

### TIER 2 — Fix This Week (Auth Hardening)

---

#### M-09 🟠 — Timing-unsafe admin token comparison (3 locations)

**Confirmed locations:**
1. `middleware.ts` line ~28: `token !== process.env.ADMIN_SECRET`
2. `lib/admin-auth.ts`: `return token === env.ADMIN_SECRET`
3. `app/admin/layout.tsx` line 15: `token !== process.env.ADMIN_SECRET`

**Required fix — update `lib/admin-auth.ts` (all other locations import from here or should):**
```ts
// lib/admin-auth.ts — REPLACE ENTIRE FILE
import { timingSafeEqual } from 'crypto';
import { env } from './env';
import type { NextRequest } from 'next/server';

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function verifyAdmin(req: NextRequest): boolean {
  const token =
    req.cookies.get('admin_token')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const secret = env.ADMIN_SECRET;
  if (!token || !secret) return false;
  return timingSafeCompare(token, secret);
}

export function extractToken(req: NextRequest): string | null {
  return (
    req.cookies.get('admin_token')?.value ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    null
  );
}
```

**Update `app/admin/layout.tsx`** — replace the inline comparison with an import:
```ts
// app/admin/layout.tsx
import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const secret = env.ADMIN_SECRET;

  const isAuthorized = token && secret &&
    (() => {
      try {
        const a = Buffer.from(token);
        const b = Buffer.from(secret);
        return a.length === b.length && timingSafeEqual(a, b);
      } catch { return false; }
    })();

  if (!isAuthorized) {
    return <>{children}</>;
  }
  // ... rest unchanged
}
```

**Update `middleware.ts`** — replace the inline comparison:
```ts
// middleware.ts — replace both raw === comparisons with:
import { verifyAdmin } from '@/lib/admin-auth';

// For admin page check:
if (pathname.startsWith('/admin')) {
  if (!verifyAdmin(request)) {
    if (pathname === '/admin/login') return NextResponse.next();
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
}

// For API check:
if (pathname.startsWith('/api/crawl') || pathname.startsWith('/api/domains')) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
}
```

---

#### M-10 🟠 — Login side-channel via real `/api/domains` call

**Confirmed location:** `app/admin/login/page.tsx` — the `handleSubmit` function calls `fetch('/api/domains')` to validate the token.

**Required fix:** Implement M-04 first (the new `POST /api/admin/login` route). Once that exists, this is automatically fixed because `handleSubmit` is rewritten to call the new route.

---

#### M-11 🟠 — Undocumented `ADMIN_TOKEN` alias bypasses Zod validation

**Confirmed location:** `app/api/startup/route.ts`
```ts
if (token !== process.env.ADMIN_SECRET && token !== process.env.ADMIN_TOKEN) {
```

**Required fix:**
```ts
// app/api/startup/route.ts — replace the auth check with:
import { timingSafeEqual } from 'crypto';
import { env } from '@/lib/env';

function verifyStartupToken(token: string | null): boolean {
  const secret = env.ADMIN_SECRET;
  if (!token || !secret) return false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

// In POST handler:
const token = authHeader?.replace(/^Bearer\s+/i, '');
if (!verifyStartupToken(token)) {
  return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
}
```

Remove all `process.env.ADMIN_TOKEN` references from the entire codebase.

---

#### M-12 🟠 — `/api/voice-function` has no authentication

**Confirmed location:** `app/api/voice-function/route.ts` — no session check

**Required fix:**
```ts
// app/api/voice-function/route.ts — add at top of POST handler
import { auth } from '@/auth';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return errorResponse('UNAUTHORIZED', 'Authentication required', 401);
  }
  // ... rest unchanged
}
```

---

#### M-13 🟠 — No rate limiting on `/api/chat`

**Required fix — add sliding window rate limiter to `middleware.ts`:**

```ts
// lib/rate-limiter.ts — NEW FILE
const store = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
```

```ts
// middleware.ts — add before admin checks
import { checkRateLimit } from '@/lib/rate-limiter';

if (pathname === '/api/chat') {
  const ip = request.ip ?? request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const allowed = checkRateLimit(`chat:${ip}`, 20, 60_000); // 20 per minute
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests', code: 'RATE_LIMITED' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60' } },
    );
  }
}
```

Note: This in-memory limiter works for single-process deployments. For distributed deployments (Vercel, multiple instances), replace with `@upstash/ratelimit`.

---

#### M-14 🟠 — Dual auth systems (NextAuth + ADMIN_SECRET)

This is the architectural root cause of most TIER 1 issues. The recommended fix is to unify everything under NextAuth by adding a `role` field.

**Required fix — 5 steps:**

**Step 1:** Add `role` to NextAuth types in `auth.ts`:
```ts
// auth.ts — update callbacks
callbacks: {
  session({ session, token }) {
    if (session.user && token.sub) {
      session.user.id = token.sub;
      session.user.role = token.role as string | undefined;
    }
    return session;
  },
  jwt({ token, user }) {
    if (user) {
      token.sub = user.id;
      token.role = (user as { role?: string }).role;
    }
    return token;
  },
},
```

**Step 2:** Add `role` to NextAuth session type declaration. Create `types/next-auth.d.ts`:
```ts
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role?: string } & DefaultSession['user'];
  }
}
```

**Step 3:** Create seed script `scripts/seed-admin.ts`:
```ts
import { MongoClient, ObjectId } from 'mongodb';
import { hashPassword } from '../lib/auth/password';

async function seedAdmin() {
  const uri = process.env.MONGODB_URI!;
  const email = process.env.ADMIN_EMAIL!;
  const password = process.env.ADMIN_PASSWORD!;
  if (!uri || !email || !password) throw new Error('MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD required');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.DB_NAME ?? 'edurag');
  const users = db.collection('users');

  const existing = await users.findOne({ email: email.toLowerCase() });
  if (existing) {
    await users.updateOne({ email: email.toLowerCase() }, { $set: { role: 'admin' } });
    console.log('Updated existing user to admin role');
  } else {
    const { passwordHash, passwordSalt } = await hashPassword(password);
    await users.insertOne({
      _id: new ObjectId(),
      name: 'Admin',
      email: email.toLowerCase(),
      image: null,
      emailVerified: null,
      passwordHash,
      passwordSalt,
      role: 'admin',
    });
    console.log('Created admin user');
  }
  await client.close();
}

seedAdmin().catch(console.error);
```

**Step 4:** Update `middleware.ts` to use NextAuth session for admin checks (replaces ADMIN_SECRET checks):
```ts
// middleware.ts — replace all ADMIN_SECRET-based checks
import { auth } from './auth';

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

  if (pathname.startsWith('/admin') && pathname !== '/admin/login' && pathname !== '/auth/signin') {
    if (!session?.user || session.user.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  if (
    (pathname.startsWith('/api/crawl') ||
     pathname.startsWith('/api/domains') ||
     pathname.startsWith('/api/faqs') && request.method !== 'GET') &&
    session?.user?.role !== 'admin'
  ) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  // ... onboarding / setup redirect logic unchanged
});
```

**Step 5:** Update all API routes that call `verifyAdmin(req)` to instead call `auth()` and check `session.user.role === 'admin'`. Update `lib/admin-auth.ts` — keep `verifyAdmin` during transition period but have it check the NextAuth session.

After all routes are updated: delete `ADMIN_SECRET` from `.env.example` and from `lib/env.ts`.

---

#### M-15 🟠 — Two MongoDB singleton implementations

**Confirmed locations:**
- `lib/auth-client.ts` — NextAuth singleton (correct HMR-safe pattern)
- `lib/vectorstore.ts` — Second singleton in `globalThis.mongoClient`

**Required fix — use `lib/auth-client.ts` as the one true singleton:**

```ts
// lib/vectorstore.ts — REMOVE the getMongoClient singleton entirely
// REMOVE lines:
//   declare global { var mongoClient: MongoClient | undefined }
//   export async function getMongoClient(...) { ... }
//   globalThis.mongoClient = client

// REPLACE getMongoClient calls with:
import clientPromise from './auth-client';

export async function getMongoCollection<TSchema extends MongoDocument = MongoDocument>(
  collectionName: string,
): Promise<Collection<TSchema>> {
  const client = await clientPromise;
  return client.db(env.DB_NAME).collection<TSchema>(collectionName);
}

// REMOVE the customUri parameter from getMongoCollection — one connection string only
// REMOVE closeMongoClient() — lifecycle managed by auth-client singleton

// RENAME lib/auth-client.ts → lib/mongodb.ts
// Update all imports from '@/lib/auth-client' to '@/lib/mongodb'
```

---

#### M-16 🟠 — `listConversations()` leaks all users' data

**Confirmed location:** `lib/conversation.ts`

**Required fix:** Delete `listConversations()` entirely. The scoped `getUserConversations(userId, limit)` already exists and is the correct function. Search codebase for any callers of `listConversations` and replace them with `getUserConversations`.

---

#### M-17 🟠 — `synthesizeFaqAnswer` has no error handling — causes retry storm

**Confirmed location:** `lib/faq-manager.ts` — `synthesizeFaqAnswer` is called without try/catch; the error propagates up and is silently swallowed in `chat/route.ts`. On next request for same question, synthesis retries again.

**Required fix:**
```ts
// lib/faq-manager.ts — replace synthesizeFaqAnswer entirely
async function synthesizeFaqAnswer(faqId: string, question: string): Promise<void> {
  const col = await getMongoCollection(env.FAQ_COLLECTION);

  // Atomic lock — prevents concurrent re-entry for same FAQ
  const reserved = await col.findOneAndUpdate(
    { _id: new ObjectId(faqId), synthesisStatus: { $nin: ['in_progress', 'done'] } },
    { $set: { synthesisStatus: 'in_progress' } },
  );
  if (!reserved) return; // Already locked or already done

  try {
    const { text } = await generateText({
      model: chatModel,
      prompt: FAQ_SYNTHESIS_PROMPT.replace('{QUESTION}', question),
    });

    if (!text || text.trim().length < 20) {
      throw new Error('Generated answer too short or empty');
    }

    await col.updateOne(
      { _id: new ObjectId(faqId) },
      {
        $set: {
          answer: text.trim(),
          public: false,
          pendingApproval: true,
          synthesisStatus: 'done',
          synthesizedAt: new Date(),
        },
      },
    );
  } catch (err) {
    console.error('[FAQ] synthesis failed for:', question, err);
    await col.updateOne(
      { _id: new ObjectId(faqId) },
      {
        $set: {
          synthesisStatus: 'failed',
          synthesisError: err instanceof Error ? err.message : String(err),
          synthesisFailedAt: new Date(),
        },
      },
    );
  }
}
```

Also update `trackAndMaybeGenerateFaq` threshold check to include the status guard:
```ts
if (result && result.count >= env.FAQ_THRESHOLD && !result.answer && !result.synthesisStatus) {
  await synthesizeFaqAnswer(result._id.toString(), question);
}
```

Add `synthesisStatus` field to `FaqDocument` interface.

---

#### M-18 🟠 — Admin server actions have no independent auth

**Confirmed locations:**
- `app/admin/settings/page.tsx` — `saveSettings` server action: no auth check
- `app/admin/knowledge-base/page.tsx` — `saveCrawlSettings` server action: no auth check

Next.js server actions use CSRF protection via origin validation, but they do not verify the admin cookie independently. The layout renders children without the sidebar if not authenticated, but the server action itself can be called directly.

**Required fix — add auth check at top of each server action:**
```ts
// app/admin/settings/page.tsx — inside saveSettings server action
async function saveSettings(formData: FormData) {
  'use server';
  const { cookies } = await import('next/headers');
  const { timingSafeEqual } = await import('crypto');
  const { env } = await import('@/lib/env');

  const cookieStore = await cookies();
  const token = cookieStore.get('admin_token')?.value;
  const secret = env.ADMIN_SECRET;
  const isAuthorized = token && secret && (() => {
    try {
      const a = Buffer.from(token);
      const b = Buffer.from(secret);
      return a.length === b.length && timingSafeEqual(a, b);
    } catch { return false; }
  })();

  if (!isAuthorized) throw new Error('Unauthorized');

  // ... rest of existing saveSettings logic unchanged
}
```

Apply the same pattern to `saveCrawlSettings` in `app/admin/knowledge-base/page.tsx`.

After M-14 (NextAuth admin role) is implemented, replace this with:
```ts
const session = await auth();
if (session?.user?.role !== 'admin') throw new Error('Unauthorized');
```

---

### TIER 3 — Fix This Month (Data Quality & Reliability)

---

#### M-19 🟡 — Incompatible vector document schemas in same collection

**Confirmed locations:**
- `lib/crawl.ts` → `MongoDBAtlasVectorSearch.addDocuments()` → stores as `{ text: "...", metadata: { url, title, threadId } }`
- `app/api/onboarding/crawl/route.ts` → `insertMany()` → stores as `{ content: "...", url, title, embedding, crawledAt }`

The fallback in `vectorstore.ts`:
```ts
doc.pageContent = doc.pageContent || doc.metadata?.content || doc.metadata?.text || '';
```
silently drops reranking candidates when neither field is present.

**Required fix:**
1. Rewrite `app/api/onboarding/crawl/route.ts` to call `crawlAndVectorize()` from `lib/crawl.ts` after M-07 refactor is done. The route handler becomes a thin SSE wrapper around the shared function.
2. Write a one-off migration script `scripts/migrate-vector-schema.ts`:
```ts
// Find all docs with 'content' key and no 'text' key, rewrite them
const col = await getMongoCollection(env.VECTOR_COLLECTION);
const cursor = col.find({ content: { $exists: true }, text: { $exists: false } });
let count = 0;
for await (const doc of cursor) {
  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        text: doc.content,
        metadata: { url: doc.url, title: doc.title, threadId: doc.threadId ?? 'onboarding' },
      },
      $unset: { content: '', url: '', title: '' },
    },
  );
  count++;
}
console.log(`Migrated ${count} documents`);
```
3. Remove the fallback chain from `similaritySearchWithScore`.

---

#### M-20 🟡 — `appendMessage` race condition on first message

**Confirmed location:** `lib/conversation.ts` — findOne + conditional insertOne pattern

**Required fix:**
```ts
// lib/conversation.ts — replace appendMessage
export async function appendMessage(
  threadId: string,
  message: Message,
  userId?: string,
): Promise<void> {
  const collection = await getConversationsCollection();

  try {
    await collection.findOneAndUpdate(
      { threadId },
      {
        $push: { messages: message } as unknown as UpdateFilter<ConversationDocument>['$push'],
        $set: { updatedAt: new Date(), ...(userId ? { userId } : {}) },
        $setOnInsert: {
          threadId,
          userId: userId ?? null,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
  } catch (err) {
    // Handle cross-user write attempt by checking error type
    const message_str = err instanceof Error ? err.message : String(err);
    if (message_str.includes('E11000')) {
      // Duplicate key — concurrent first message; safe to ignore
      return;
    }
    throw err;
  }
}
```

---

#### M-21 🟡 — FAQ secondary synthesis race condition

Fixed by M-17 — the `synthesisStatus` lock closes this race completely. No additional changes needed beyond what M-17 specifies.

---

#### M-22 🟡 — No `AbortSignal` through crawl pipeline

**Confirmed location:** `app/api/crawl/route.ts` and `lib/crawl.ts`

**Required fix:**

```ts
// lib/crawl.ts — add signal to CrawlOptions interface
interface CrawlOptions {
  // ... existing fields
  signal?: AbortSignal;
}

export async function crawlAndVectorize(opts: CrawlOptions): Promise<number> {
  opts.signal?.throwIfAborted(); // Check before Tavily call

  const crawlResponse = await client.crawl(opts.url, { /* ... */ });

  for (let i = 0; i < total; i++) {
    opts.signal?.throwIfAborted(); // Check before each embedding
    // ... rest of loop
  }
}
```

```ts
// app/api/crawl/route.ts — wire up AbortController
export async function POST(req: NextRequest) {
  if (!verifyAdmin(req)) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
  // ...
  const abortController = new AbortController();
  req.signal.addEventListener('abort', () => abortController.abort());

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const count = await crawlAndVectorize({
          ...body,
          signal: abortController.signal,
          onProgress: (page, total) => {
            if (abortController.signal.aborted) return;
            send({ type: 'progress', page, total });
          },
        });
        // ...
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          send({ type: 'error', message: 'Crawl cancelled' });
        } else {
          send({ type: 'error', message: err instanceof Error ? err.message : 'Crawl failed' });
        }
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { /* ... */ });
}
```

---

#### M-23 🟡 — Re-crawl duplicates all vectors

**Required fix:**

```ts
// lib/crawl.ts — add content hashing and upsert
import { createHash } from 'crypto';

// In crawlAndVectorize, replace vectorStore.addDocuments(documents) with:
const ops = documents.map(doc => {
  const contentHash = createHash('sha256')
    .update(doc.metadata.url + doc.pageContent)
    .digest('hex')
    .slice(0, 16);

  return {
    updateOne: {
      filter: { 'metadata.threadId': doc.metadata.threadId, 'metadata.contentHash': contentHash },
      update: {
        $set: {
          text: doc.pageContent,
          embedding: null, // will be set by addDocuments equivalent
          metadata: { ...doc.metadata, contentHash, crawledAt: new Date() },
        },
      },
      upsert: true,
    },
  };
});
```

Simpler approach: before `addDocuments`, delete all existing docs for this threadId, then re-insert. This is safe because crawl is an admin-only operation:
```ts
// In crawlAndVectorize, before addDocuments:
await collection.deleteMany({ 'metadata.threadId': opts.threadId });
// Then addDocuments as before
```

The delete-first approach is simpler and correct for the current single-university use case. Add a unique compound index on `{ 'metadata.threadId': 1, 'metadata.contentHash': 1 }` for the hash-based approach.

---

#### M-24 🟡 — No ceiling on `broadK` in reranking

**Confirmed location:** `lib/vectorstore.ts`

**Required fix:**
```ts
// lib/vectorstore.ts
const MAX_BROAD_K = 50;
const broadK = Math.min(Math.max(k * 4, 25), MAX_BROAD_K);
```

---

#### M-25 🟡 — Title model hardcoded, bypasses settings

**Confirmed location:** `lib/title-generator.ts`
```ts
const TITLE_MODEL = 'llama3.1-8b'; // hardcoded — ignores env.CHAT_MODEL
```

**Required fix:**
```ts
// lib/title-generator.ts — remove the constant, use configured model
import { generateText } from 'ai';
import { chatModel } from './providers'; // uses env.CHAT_MODEL

export async function generateAndSaveTitle(...) {
  const { text } = await generateText({
    model: chatModel, // was: getChatProvider().chat('llama3.1-8b')
    system: `...`,
    prompt: userMessage,
  });
  // ... rest unchanged
}
```

Alternatively, add `TITLE_MODEL` to `lib/env.ts` with a sensible default if a faster/cheaper model is desired for titles:
```ts
TITLE_MODEL: z.string().default('llama3.1-8b'),
```

---

#### M-26 🟡 — Detect endpoint allows explicit `http://` URLs

**Confirmed location:** `app/api/onboarding/detect/route.ts`

**Required fix:**
```ts
// app/api/onboarding/detect/route.ts — after URL parse, add:
if (parsedUrl.protocol === 'http:') {
  // Silently upgrade to HTTPS
  parsedUrl = new URL(normalizedUrl.replace(/^http:\/\//, 'https://'));
}
if (parsedUrl.protocol !== 'https:') {
  return errorResponse('VALIDATION_ERROR', 'Only HTTPS URLs are supported', 400);
}
// Also block private IPs here using the same isPrivateOrReservedIP helper from M-08
```

---

#### M-27 🟡 — Tests use real production MongoDB and real API credits

**Confirmed locations:** All files in `__tests__/` use `env.MONGODB_URI` and real API calls.

**Required fix:**

Add to `.env.example`:
```
TEST_MONGODB_URI=   # Separate MongoDB for tests (mongodb-memory-server or test Atlas cluster)
```

Create `__tests__/setup.ts`:
```ts
import { beforeAll, afterAll } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  if (process.env.TEST_MONGODB_URI) return; // Use provided test DB
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
});

afterAll(async () => {
  await mongoServer?.stop();
});
```

Update `vitest.config.ts` to include `setupFiles: ['__tests__/setup.ts']`.

Mock Voyage AI in `__tests__/vectorstore.test.ts`:
```ts
vi.mock('../lib/providers', () => ({
  getEmbeddings: vi.fn(() => ({
    embedDocuments: vi.fn().mockResolvedValue(Array(3).fill(Array(2048).fill(0))),
    embedQuery: vi.fn().mockResolvedValue(Array(2048).fill(0)),
  })),
  getVoyageClient: vi.fn(() => ({
    rerank: vi.fn().mockResolvedValue({ data: [{ index: 0, relevanceScore: 0.9 }] }),
  })),
}));
```

Mock Tavily in `__tests__/crawl.test.ts`:
```ts
vi.mock('@tavily/core', () => ({
  tavily: vi.fn(() => ({
    crawl: vi.fn().mockResolvedValue({
      results: [{ url: 'https://test.edu/page', rawContent: '<h1>Test</h1><p>Some content here.</p>' }],
    }),
  })),
}));
```

---

### TIER 4 — Housekeeping

---

#### M-28 🟢 — Dead env vars in `.env.example`

Remove `CHAT_CONTEXT_LENGTH` and `VOYAGEAI_API_KEY` from `.env.example` (they have no corresponding Zod schema entry and are silently ignored). If `VOYAGEAI_API_KEY` was intended as an alias for `EMBEDDING_API_KEY`, document that in a comment.

---

#### M-29 🟢 — Dead LangGraph collection config

Remove `COLLECTION2` and `COLLECTION3` from `lib/env.ts` and `.env.example`. Remove `checkpoints_aio` and `checkpoint_writes_aio` from the MongoDB Collections table in `AGENTS.md`.

---

#### M-30 🟢 — Missing unique index on `threadId`

**Required fix — add to `lib/auth/ensureUserEmailIndex.ts` or create `lib/db/ensureIndexes.ts`:**
```ts
// lib/db/ensureIndexes.ts — NEW FILE
import { getMongoCollection } from '@/lib/vectorstore';
import { env } from '@/lib/env';

export async function ensureIndexes(): Promise<void> {
  const conversations = await getMongoCollection('conversations');
  await conversations.createIndex({ threadId: 1 }, { unique: true, background: true });
  await conversations.createIndex({ userId: 1, updatedAt: -1 }, { background: true });

  const faqs = await getMongoCollection(env.FAQ_COLLECTION);
  await faqs.createIndex({ normalized: 1 }, { unique: true, background: true });
  await faqs.createIndex({ public: 1, count: -1 }, { background: true });
}
```

Call `ensureIndexes()` from the `GET /api/startup` handler alongside the existing `ensureUserEmailIndex()` call.

---

#### M-31 🟢 — Deepgram package installed from GitHub commit hash

**Confirmed:** `package.json` has `"deepgram-voice-interaction-react": "github:deepgram/dg_react_agent#7191eb4a062f35344896e873f02eba69c9c46a2d"`. This is a private/pre-release package pinned to a specific commit. No npm audit runs against it, no CVE tracking.

**Required fix:** Monitor whether Deepgram publishes this to npm. When it does, switch to the versioned npm package. Until then, document the commit hash in `AGENTS.md` and periodically verify the commit still exists and hasn't been altered.

---

#### M-32 🟢 — AGENTS.md doc inconsistency

**Confirmed:** `.agents/rules/AGENTS.md` still references `ADMIN_TOKEN=...` under Environment Variables while the root `AGENTS.md` uses `ADMIN_SECRET`. After M-11 removes `ADMIN_TOKEN`, update `.agents/rules/AGENTS.md` to use `ADMIN_SECRET` and remove the `ADMIN_TOKEN` reference.

---

## §3 — Agent Package Repo (`lord-dubious/edurag-agent`)

All fixes below are for the standalone `packages/agent` directory (mirrored in `edurag-agent` repo). Changes here must be synced to both locations.

---

#### A-01 🟠 — `threadId` accepted but immediately discarded

**Confirmed location:** `src/text/index.ts`
```ts
export async function runAgent(deps, { messages, threadId, ... }: AgentOptions) {
  void threadId;  // ← thrown away
```

**Required fix:**
```ts
// src/text/index.ts — remove void threadId, use for telemetry
export async function runAgent(
  deps: AgentDependencies,
  {
    messages,
    threadId,
    universityName = 'University Knowledge Base',
    extraTools = {},
    maxSteps,
    maxTokens,
    onFinish,
  }: AgentOptions,
) {
  // Remove: void threadId;
  const steps = maxSteps ?? deps.maxSteps;
  const tokens = maxTokens ?? deps.maxTokens;

  const reservedTools = ['vector_search', 'get_popular_faqs'];
  for (const name of Object.keys(extraTools)) {
    if (reservedTools.includes(name)) {
      throw new Error(`[edurag/agent] Tool name '${name}' is reserved. Choose a different name.`);
    }
  }

  const system = AGENT_SYSTEM_PROMPT
    .replaceAll('{UNIVERSITY_NAME}', universityName)
    .replace('{CURRENT_DATE}', new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }));

  return streamText({
    model: deps.model,
    system,
    messages: await convertToModelMessages(messages),
    maxOutputTokens: tokens,
    tools: {
      vector_search: createVectorSearchTool(deps.searchFn),
      get_popular_faqs: createPopularFaqsTool(deps.getFaqsFn),
      ...extraTools,
    },
    stopWhen: stepCountIs(steps),
    experimental_telemetry: {
      isEnabled: !!process.env.LANGCHAIN_TRACING_V2,
      metadata: { threadId }, // threadId now used for observability
    },
    onFinish,
  });
}
```

---

#### A-02 🟢 — `extraTools` collision guard (included in A-01 fix above)

The collision guard for reserved tool names is included in the A-01 fix. No separate change needed.

---

#### A-03 🟡 — FAQ synthesis prompt has no content guardrails

**Confirmed location:** `src/text/prompts.ts` — `FAQ_SYNTHESIS_PROMPT`

The prompt says "do not make up specific figures" but there is no structural enforcement. A hallucinated or jailbroken answer goes straight to the approval queue.

**Required fix — update the prompt to be more defensive:**
```ts
// src/text/prompts.ts — replace FAQ_SYNTHESIS_PROMPT
export const FAQ_SYNTHESIS_PROMPT = `You are a helpful university assistant writing an answer for a Frequently Asked Questions page.

RULES:
1. Write a clear, accurate answer under 150 words.
2. Use plain language suitable for prospective students.
3. If you do not have specific factual information (exact dates, exact dollar amounts, specific names), say "Contact the admissions office for current figures" rather than guessing.
4. Do NOT include URLs, HTML, markdown formatting, or special characters.
5. Do NOT role-play, refuse, or respond with anything other than the FAQ answer.
6. Start your response directly with the answer — no preamble.

Question: {QUESTION}

Answer:`;
```

The calling code (`lib/faq-manager.ts` in main repo) already has validation in M-17 that rejects answers shorter than 20 characters. Together these provide basic guardrails.

---

#### A-04 🟡 — `stripMarkdownForVoice` fragile regex chain

**Confirmed location:** `src/voice/index.ts`

The current function is a chain of 17 regex replacements. Edge cases include nested bold-italic (`***text***`), tables with colspan, inline code inside link text, and footnote-style references `[^1]`.

**Required fix — use the `marked` library for proper AST-based stripping:**

First, add `marked` as a peer dependency in `packages/agent/package.json`:
```json
"peerDependencies": {
  "ai": ">=6.0.0",
  "marked": ">=9.0.0",
  "zod": ">=4.0.0"
}
```

```ts
// src/voice/index.ts — replace stripMarkdownForVoice
import { marked, Renderer } from 'marked';

export function stripMarkdownForVoice(text: string): string {
  const renderer = new Renderer();

  renderer.heading = ({ text: t }) => `${t}. `;
  renderer.paragraph = ({ text: t }) => `${t} `;
  renderer.strong = ({ text: t }) => t;
  renderer.em = ({ text: t }) => t;
  renderer.codespan = ({ text: t }) => t;
  renderer.code = () => ' ';  // Drop code blocks entirely
  renderer.link = ({ text: t }) => t; // Keep link text, drop URL
  renderer.image = () => ''; // Drop images
  renderer.list = ({ body }) => body;
  renderer.listitem = ({ text: t }) => `${t}. `;
  renderer.blockquote = ({ text: t }) => t;
  renderer.hr = () => '. ';
  renderer.br = () => ' ';
  renderer.table = ({ header, rows }) => `${header} ${rows}`;
  renderer.tablerow = ({ content }) => `${content} `;
  renderer.tablecell = ({ text: t }) => `${t}. `;
  renderer.del = ({ text: t }) => t;

  try {
    const html = marked(text, { renderer, async: false }) as string;
    return html
      .replace(/<[^>]+>/g, ' ')  // Strip any residual HTML tags
      .replace(/https?:\/\/\S+/g, '')  // Remove bare URLs
      .replace(/\s{2,}/g, ' ')
      .trim();
  } catch {
    // Fallback to simple strip on parse failure
    return text.replace(/[#*`_~\[\]()>|]/g, '').replace(/\s{2,}/g, ' ').trim();
  }
}
```

---

#### A-05 🟢 — Package version and sync between repos

**Confirmed:** `packages/agent/package.json` is `"version": "0.1.0"` and `"private": true`. The standalone `edurag-agent` repo is a separate GitHub repository. These will drift.

**Required fix:** Add a CI check in the main repo that diffs `packages/agent/src` against the standalone repo and posts a warning on divergence. Alternatively, commit to one source of truth and document it clearly in both `README.md` files.

---

## §4 — New Issues Found in v3 (Not in Prior Reviews)

These are findings first identified in this review pass that were not in v1 or v2:

| ID | Issue | Where | Sev |
|----|-------|-------|-----|
| M-02 | `GET /api/onboarding/complete` returns all API keys unauthenticated | `app/api/onboarding/complete/route.ts:274` | 🔴 |
| M-03 | `GET /api/onboarding/status` returns full settings object including secrets | `app/api/onboarding/status/route.ts` | 🔴 |
| M-18 | Admin server actions have no independent auth — rely on layout UI guard only | `app/admin/settings/page.tsx`, `app/admin/knowledge-base/page.tsx` | 🟠 |
| M-25 | Title model hardcoded as `'llama3.1-8b'` — ignores configured chat model | `lib/title-generator.ts:5` | 🟡 |
| M-31 | Deepgram voice package installed from unaudited GitHub commit hash | `package.json` | 🟢 |
| M-32 | `.agents/rules/AGENTS.md` references removed `ADMIN_TOKEN` var | `.agents/rules/AGENTS.md` | 🟢 |
| A-04 | `stripMarkdownForVoice` uses fragile 17-regex chain that fails on edge cases | `packages/agent/src/voice/index.ts` | 🟡 |

---

## §5 — What Is Already Correct (Do Not Touch)

The following patterns are implemented correctly and should be left unchanged or used as reference implementations:

| File | What's correct |
|------|---------------|
| `lib/auth/password.ts` | Uses `scrypt` + `timingSafeEqual`. Constant-time. Reference this for M-09. |
| `auth.ts` | NextAuth v5 Credentials + OAuth. JWT strategy. MongoDB adapter. Correct callbacks. |
| `lib/auth-client.ts` | HMR-safe MongoDB singleton (`globalThis._mongoClientPromise`). This is the canonical singleton to keep. |
| `lib/env.ts` | Zod schema with `min(16)` on `ADMIN_SECRET`. Correct lazy-parse pattern. |
| `lib/faq-manager.ts` — `trackAndMaybeGenerateFaq` | Atomic `findOneAndUpdate` with `$setOnInsert`. Race-safe for the tracking step. |
| `lib/vectorstore.ts` — reranking | Timeout + fallback to raw vector scores. Correct pattern. |
| `app/api/upload/route.ts` | Magic-byte validation (not just MIME/extension). Best-practice file upload security. |
| `lib/crawl.ts` — `cleanContent()` | Strips nav, cookie banners, boilerplate before chunking. |
| `lib/errors.ts` | Typed `AppErrorCode` enum. Dev-only details via `NODE_ENV` check. |
| `lib/conversation.ts` — `appendMessage` ownership check | Cross-user write prevention is correct. |
| `app/api/auth/register/route.ts` — duplicate handling | Two-phase check (findOne + catch E11000) is correct. Just needs the registration gate from M-05. |
| `app/api/upload/route.ts` — UPLOADTHING redirect | Correctly redirects if UploadThing is configured, preventing double uploads. |
| `app/api/onboarding/complete/route.ts` — POST | The POST handler (onboarding setup) correctly blocks re-onboarding if already configured. |
| `lib/db/mongoErrors.ts` | `isDuplicateKeyError` utility is correct. |
| `__tests__/api/upload.test.ts` | Properly mocked — no real filesystem writes. Reference this pattern for other tests. |
| `__tests__/api/onboarding.test.ts` | Properly mocked settings layer. Reference this for fixing M-27. |

---

## §6 — Implementation Sequence for Agent

Execute in this exact order to avoid breaking changes mid-migration:

```
Phase 1 — Data Leaks (do first, standalone changes)
  M-02: Remove API keys from GET /api/onboarding/complete
  M-03: Remove full settings from GET /api/onboarding/status  
  M-01: Add auth + temp tokens to /api/voice-token
  M-06: Add auth to /api/onboarding/crawl
  M-07: Replace HTTP sub-request with direct function call (lib/onboarding-crawl.ts)

Phase 2 — Auth Hardening
  M-09: timingSafeEqual everywhere (lib/admin-auth.ts, middleware.ts, admin/layout.tsx)
  M-04: Server-side HttpOnly cookie for admin login (new /api/admin/login route)
  M-10: Update login page to use new route (automatic after M-04)
  M-05: Gate /api/auth/register with ALLOW_REGISTRATION flag
  M-11: Remove ADMIN_TOKEN alias, use env.ADMIN_SECRET everywhere
  M-08: SSRF protection (add assertSafeCrawlUrl to lib/crawl.ts)
  M-12: Add auth to /api/voice-function
  M-18: Add auth to admin server actions

Phase 3 — Architecture Cleanup
  M-15: Merge MongoDB singletons (make lib/auth-client.ts the one source)
  M-14: Unify auth systems (NextAuth admin role, seed script, delete ADMIN_SECRET)
  M-16: Delete unscoped listConversations()
  M-13: Add rate limiting to /api/chat

Phase 4 — Data Quality
  M-19: Standardise vector schema + migration script
  M-20: Atomic appendMessage with upsert
  M-17: synthesizeFaqAnswer with try/catch + synthesisStatus lock
  M-30: Add ensureIndexes() called from /api/startup GET
  M-22: AbortSignal through crawl pipeline
  M-23: Content dedup (delete-before-insert approach)
  M-24: broadK ceiling
  M-25: Fix title model to use env.CHAT_MODEL
  M-26: Detect endpoint HTTPS enforcement

Phase 5 — Agent Package (edurag-agent repo)
  A-01: Remove void threadId, add collision guard for extraTools
  A-03: Update FAQ synthesis prompt
  A-04: Replace regex chain with marked-based stripMarkdownForVoice
  Sync packages/agent ↔ standalone repo

Phase 6 — Housekeeping
  M-27: Test database isolation + mocked external calls
  M-28: Remove dead env vars from .env.example
  M-29: Remove COLLECTION2/3 dead config
  M-31: Document Deepgram commit hash, plan migration to npm release
  M-32: Fix .agents/rules/AGENTS.md doc inconsistency
  A-05: Document package sync policy
```
