# EduRAG — Architecture & Technical Specification
### Next.js 15 · Vercel AI SDK · MongoDB Atlas · Tavily JS SDK · AI Elements

> **Template purpose**: A self-hostable RAG knowledge base for universities. Administrators crawl and index institutional content via a protected backend dashboard. Students interact with a public chat UI that surfaces cited answers and auto-generated FAQs.

---

## Reference LLM.txts

Keep these open while building. Each is the authoritative context for its layer:

| Library | LLM.txt URL | Purpose |
|---|---|---|
| **AI Elements** | https://elements.ai-sdk.dev/llms.txt | Message, Conversation, PromptInput, InlineCitation, Confirmation |
| **Vercel AI SDK** | https://ai-sdk.dev/llms.txt | `streamText`, `tool()`, `useChat`, `generateText` |
| **LangChain JS** | https://js.langchain.com/llms.txt | `@langchain/mongodb` vector store, embeddings, text splitters |
| **Tavily JS SDK** | https://docs.tavily.com/llms.txt | `@tavily/core` crawl params and response shape |
| **MongoDB Atlas** | https://www.mongodb.com/docs/llms.txt | Vector index creation, filter fields |
| **Next.js** | https://nextjs.org/llms.txt | App Router, Route Handlers, middleware, ISR |

---

## 1. Project Overview

EduRAG is the TypeScript/Next.js 15 equivalent of Tavily's `crawl2rag` project, replacing Python/FastAPI + LangGraph with a fully integrated Next.js stack. Same two-phase architecture:

1. **Knowledge Ingestion** — Admin crawls institutional URLs via Tavily, chunks, embeds, and stores them in MongoDB Atlas Vector Search.
2. **Conversational RAG** — Students query an AI agent that performs semantic vector search, returns streamed cited answers, and passively generates FAQs.

### Architectural Decisions vs Original `crawl2rag`

| Concern | Python crawl2rag | EduRAG | Rationale |
|---|---|---|---|
| Framework | FastAPI + React (Vite) | Next.js 15 App Router | Unified full-stack |
| Streaming | SSE from FastAPI | Vercel AI SDK `streamText` | Native Next.js, `useChat` hook |
| Agent | LangGraph ReAct agent | Vercel AI SDK `streamText` + tools | Simpler, no LangGraph JS needed |
| LLM Client | `langchain-openai` | `@ai-sdk/openai` compat provider | Works directly with `streamText` |
| Persistence | LangGraph-MongoDB checkpointer | Custom MongoDB conversation store | Removes LangGraph JS dependency |
| Crawling | `tavily` Python SDK | `@tavily/core` JS SDK | Direct JS equivalent |
| Vector Store | LangChain Python | `@langchain/mongodb` | Same abstraction, JS port |
| UI Components | Raw React + custom CSS | AI Elements + shadcn/ui | AI-native, production-grade |

---

## 2. Technical Stack

| Layer | Package | Version |
|---|---|---|
| **Framework** | `next` | 15.x App Router |
| **UI Components** | `ai-elements`, `shadcn/ui`, `tailwindcss` | latest |
| **Streaming** | `ai` (Vercel AI SDK) | ^4.x |
| **Chat Hook** | `@ai-sdk/react` | ^1.x |
| **LLM Client** | `@ai-sdk/openai` | ^1.x |
| **Vector Store** | `@langchain/mongodb` | ^0.x |
| **Embeddings** | `@langchain/openai` | ^0.x |
| **Text Splitter** | `@langchain/textsplitters` | ^0.x |
| **Crawling** | `@tavily/core` | ^0.x |
| **MongoDB Driver** | `mongodb` | ^6.x |
| **Validation** | `zod` | ^3.x |
| **IDs** | `nanoid` | ^5.x |
| **Language** | TypeScript strict | ^5.x |

---

## 3. Directory Structure

```
edurag/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                 # Landing — FAQ + hero CTA (ISR)
│   │   └── chat/page.tsx            # Student chat UI
│   ├── admin/
│   │   ├── layout.tsx               # Auth guard
│   │   ├── login/page.tsx
│   │   ├── page.tsx                 # Dashboard overview
│   │   ├── domains/page.tsx         # Domain management + crawl trigger
│   │   └── faqs/page.tsx            # FAQ review & approval
│   └── api/
│       ├── chat/route.ts            # POST — streaming chat (SSE)
│       ├── crawl/route.ts           # POST — crawl with SSE progress
│       ├── domains/route.ts         # GET/POST/DELETE — domain registry
│       ├── faqs/route.ts            # GET — public FAQ list
│       └── threads/route.ts         # DELETE — clear conversation
├── lib/
│   ├── agent/
│   │   ├── index.ts                 # Agent entry point — composes tools + prompt
│   │   ├── prompts.ts               # All system prompts (editable)
│   │   ├── tools.ts                 # Tool registry (add new tools here)
│   │   └── types.ts                 # Agent-specific interfaces
│   ├── providers.ts                 # LLM + Embedding factories
│   ├── crawl.ts                     # Tavily crawl + chunk + embed pipeline
│   ├── vectorstore.ts               # MongoDB Atlas vector store singleton
│   ├── conversation.ts              # MongoDB conversation history
│   ├── faq-manager.ts               # FAQ frequency tracker + synthesizer
│   ├── errors.ts                    # Shared error types + response helper
│   ├── auth.ts                      # Admin bearer token verification
│   └── env.ts                       # Zod-validated env schema
├── components/
│   ├── chat/
│   │   ├── ChatInterface.tsx        # Full chat page layout
│   │   ├── ChatMessages.tsx         # AI Elements message list
│   │   ├── ChatInput.tsx            # AI Elements PromptInput
│   │   ├── CitationPanel.tsx        # Right-panel source cards
│   │   └── SessionSidebar.tsx       # Left-panel session list
│   ├── landing/
│   │   ├── Hero.tsx
│   │   └── FaqSection.tsx
│   └── admin/
│       ├── DomainForm.tsx
│       ├── CrawlProgress.tsx        # SSE-based live progress
│       └── KnowledgeBaseTable.tsx
├── middleware.ts
└── .env.local
```

---

## 4. Environment Variables

```bash
# ─── Chat Provider (OpenAI-compatible) ───────────────────────────────────────
CHAT_API_KEY=
CHAT_BASE_URL=https://api.cerebras.ai/v1
CHAT_MODEL=gpt-oss-120b
CHAT_MAX_TOKENS=32000
CHAT_CONTEXT_LENGTH=65536

# ─── Embedding Provider (Voyage AI via OpenAI-compat endpoint) ───────────────
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://api.voyageai.com/v1
EMBEDDING_MODEL=voyage-4-large
EMBEDDING_DIMENSIONS=2048            # Must match MongoDB vector index numDimensions

# ─── MongoDB ─────────────────────────────────────────────────────────────────
MONGODB_URI=
DB_NAME=edurag
COLLECTION1=crawled_index
COLLECTION2=checkpoints_aio          # Reserved (future LangGraph compat)
COLLECTION3=checkpoint_writes_aio    # Reserved (future LangGraph compat)
VECTOR_COLLECTION=crawled_index
VECTOR_INDEX_NAME=index
CONVERSATIONS_COLLECTION=conversations
FAQ_COLLECTION=faqs
DOMAINS_COLLECTION=domains

# ─── FAQ Engine ───────────────────────────────────────────────────────────────
FAQ_THRESHOLD=5

# ─── Tavily ──────────────────────────────────────────────────────────────────
TAVILY_API_KEY=

# ─── Crawl Defaults (all overridable per-crawl via admin UI form) ─────────────
CRAWL_MAX_DEPTH=2
CRAWL_MAX_BREADTH=20
CRAWL_LIMIT=100
CRAWL_EXTRACT_DEPTH=advanced         # "basic" | "advanced"
CRAWL_INSTRUCTIONS=                  # Optional NL guidance for crawler
CRAWL_SELECT_PATHS=                  # Comma-separated, e.g. /academics/*,/admissions/*
CRAWL_EXCLUDE_PATHS=/admin/*,/login/*
CRAWL_ALLOW_EXTERNAL=false
CRAWL_FORMAT=markdown                # "markdown" | "text"

# ─── Admin Auth ──────────────────────────────────────────────────────────────
ADMIN_SECRET=                        # Min 16 chars — bearer token for admin routes
NEXT_PUBLIC_APP_NAME=University Knowledge Base
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

---

## 5. Core Modules

### 5.1 `lib/env.ts` — Validated Environment Schema

All env vars pass through Zod before use. Never read `process.env` directly anywhere else.

```typescript
import { z } from 'zod';

const envSchema = z.object({
  CHAT_API_KEY: z.string().min(1),
  CHAT_BASE_URL: z.string().url(),
  CHAT_MODEL: z.string(),
  CHAT_MAX_TOKENS: z.coerce.number().default(32000),

  EMBEDDING_API_KEY: z.string().min(1),
  EMBEDDING_BASE_URL: z.string().url(),
  EMBEDDING_MODEL: z.string(),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(2048),

  MONGODB_URI: z.string().min(1),
  DB_NAME: z.string().default('edurag'),
  VECTOR_COLLECTION: z.string().default('crawled_index'),
  VECTOR_INDEX_NAME: z.string().default('index'),
  CONVERSATIONS_COLLECTION: z.string().default('conversations'),
  FAQ_COLLECTION: z.string().default('faqs'),
  DOMAINS_COLLECTION: z.string().default('domains'),

  FAQ_THRESHOLD: z.coerce.number().default(5),
  TAVILY_API_KEY: z.string().min(1),

  CRAWL_MAX_DEPTH: z.coerce.number().min(1).max(5).default(2),
  CRAWL_MAX_BREADTH: z.coerce.number().min(1).max(100).default(20),
  CRAWL_LIMIT: z.coerce.number().default(100),
  CRAWL_EXTRACT_DEPTH: z.enum(['basic', 'advanced']).default('advanced'),
  CRAWL_INSTRUCTIONS: z.string().optional(),
  CRAWL_SELECT_PATHS: z.string().optional(),
  CRAWL_EXCLUDE_PATHS: z.string().optional(),
  CRAWL_ALLOW_EXTERNAL: z.coerce.boolean().default(false),
  CRAWL_FORMAT: z.enum(['markdown', 'text']).default('markdown'),

  ADMIN_SECRET: z.string().min(16),
  NEXT_PUBLIC_APP_NAME: z.string().default('University Knowledge Base'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
```

---

### 5.2 `lib/providers.ts`

```typescript
import { createOpenAI } from '@ai-sdk/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { env } from './env';

export const chatProvider = createOpenAI({
  apiKey: env.CHAT_API_KEY,
  baseURL: env.CHAT_BASE_URL,
});

export const chatModel = chatProvider(env.CHAT_MODEL, {
  maxTokens: env.CHAT_MAX_TOKENS,
});

// Voyage AI works via OpenAI-compat endpoint — same package, different baseURL
export const embeddings = new OpenAIEmbeddings({
  apiKey: env.EMBEDDING_API_KEY,
  configuration: { baseURL: env.EMBEDDING_BASE_URL },
  modelName: env.EMBEDDING_MODEL,
  dimensions: env.EMBEDDING_DIMENSIONS,
});
```

---

### 5.3 `lib/agent/prompts.ts` — System Prompts

Mirrors the role of `backend/prompts.py` in the original crawl2rag. All prompts centralised here — tune without touching agent logic.

```typescript
export const AGENT_SYSTEM_PROMPT = `You are a knowledgeable and helpful university assistant for {UNIVERSITY_NAME}.

Your primary role is to answer questions about the university using the knowledge base. You have access to a vector_search tool that retrieves relevant content from the university's official website.

## Behavior Rules

1. **Always use vector_search before answering factual questions** about the university — admissions, programs, tuition, deadlines, campus life, contacts, events, or policies.
2. **Do not search for conversational exchanges** — greetings, clarifications, or general knowledge questions that don't require institutional information.
3. **Cite your sources** after every answer that uses retrieved content. Format: "Source: [page title](url)"
4. **Be concise and direct** — students need quick, accurate answers. Lead with the answer, then add detail.
5. **Acknowledge uncertainty honestly** — if the knowledge base doesn't contain relevant information, say so clearly and suggest the student contact the relevant office directly.
6. **Never fabricate information** about programs, deadlines, fees, or staff. Only state what is in the retrieved documents.
7. **Maintain a professional, welcoming tone** appropriate for prospective and current students.

## Response Format

- Short factual answers (deadlines, fees, contact info): 1–3 sentences + citation
- Complex questions (program comparisons, admission processes): structured response with headers if needed, citations at end
- When multiple sources agree, cite all of them
- When sources conflict, note the discrepancy and recommend verifying with the official office

## Knowledge Base Scope

The knowledge base contains content crawled from the university's official website. It may include: academic programs, admission requirements, tuition and fees, scholarships, campus facilities, student services, faculty information, and events.

Today's date: {CURRENT_DATE}`;

export const FAQ_SYNTHESIS_PROMPT = `You are a helpful university assistant.
Write a clear, accurate, and concise answer to the following frequently asked question.
Keep the answer under 150 words. Use plain language suitable for prospective students.
Do not make up specific figures or dates — speak in general terms if you lack specifics.

Question: {QUESTION}`;
```

---

### 5.4 `lib/agent/tools.ts` — Extensible Tool Registry

Each tool is a self-contained export. **To add a new tool**: add an export here, register it in `lib/agent/index.ts`. No other files need to change.

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { getVectorStore } from '../vectorstore';

// ─── Tool: Vector Search ─────────────────────────────────────────────────────
export const createVectorSearchTool = (threadId: string) =>
  tool({
    description:
      'Search the university knowledge base for information about programs, admissions, fees, campus life, deadlines, and any other university-related topics.',
    inputSchema: z.object({
      query: z.string().describe('A specific search query. Be precise for better results.'),
      topK: z.number().optional().default(5),
    }),
    execute: async ({ query, topK = 5 }) => {
      const vectorStore = await getVectorStore(threadId);
      const results = await vectorStore.similaritySearchWithScore(query, topK);

      if (results.length === 0) return { found: false, results: [] };

      return {
        found: true,
        results: results.map(([doc, score]) => ({
          content: doc.pageContent,
          url: doc.metadata.url as string,
          title: doc.metadata.title as string | undefined,
          score: Math.round(score * 100) / 100,
        })),
      };
    },
  });

// ─── Tool: Get Popular FAQs ───────────────────────────────────────────────────
export const getPopularFaqsTool = tool({
  description: 'Retrieve the most frequently asked questions to suggest related topics.',
  inputSchema: z.object({ limit: z.number().optional().default(3) }),
  execute: async ({ limit }) => {
    const { getPublicFaqs } = await import('../faq-manager');
    const faqs = await getPublicFaqs(limit);
    return faqs.map(f => ({ question: f.question, answer: f.answer }));
  },
});

// ─── Add future tools below ───────────────────────────────────────────────────
// Examples: calendar_search, staff_directory_lookup, course_search, event_lookup
// Pattern: export const myTool = tool({ description, inputSchema, execute })
// Then register in lib/agent/index.ts extraTools or the default tools map
```

---

### 5.5 `lib/agent/index.ts` — Agent Entry Point

Composable design: swap prompt, add tools, change `maxSteps` without touching route handlers.

```typescript
import { streamText, type CoreMessage } from 'ai';
import { chatModel } from '../providers';
import { AGENT_SYSTEM_PROMPT } from './prompts';
import { createVectorSearchTool, getPopularFaqsTool } from './tools';
import { env } from '../env';

interface AgentOptions {
  messages: CoreMessage[];
  threadId: string;
  universityName?: string;
  /** Inject extra tools at runtime — useful for feature-flagging or testing */
  extraTools?: Record<string, ReturnType<typeof import('ai').tool>>;
  maxSteps?: number;
}

export function runAgent({
  messages,
  threadId,
  universityName = env.NEXT_PUBLIC_APP_NAME,
  extraTools = {},
  maxSteps = 3,
}: AgentOptions) {
  const system = AGENT_SYSTEM_PROMPT
    .replace('{UNIVERSITY_NAME}', universityName)
    .replace('{CURRENT_DATE}', new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    }));

  return streamText({
    model: chatModel,
    system,
    messages,
    tools: {
      vector_search: createVectorSearchTool(threadId),
      get_popular_faqs: getPopularFaqsTool,
      ...extraTools,
    },
    maxSteps,
  });
}
```

---

### 5.6 `lib/errors.ts` — Shared Error Handling

```typescript
export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'AGENT_ERROR'
  | 'CRAWL_FAILED'
  | 'DB_ERROR'
  | 'RATE_LIMITED';

export interface AppError {
  error: string;
  code: AppErrorCode;
  details?: unknown;
}

export function errorResponse(
  code: AppErrorCode,
  message: string,
  status: number,
  err?: unknown,
): Response {
  const body: AppError = {
    error: message,
    code,
    ...(process.env.NODE_ENV === 'development' && err
      ? { details: err instanceof Error ? err.message : String(err) }
      : {}),
  };
  return Response.json(body, { status });
}
```

All route handlers follow this pattern:

```typescript
export async function POST(req: Request) {
  // 1. Auth (admin routes only)
  if (!verifyAdmin(req)) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

  // 2. Input validation
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid request', 400, err);
  }

  // 3. Business logic
  try {
    const result = await doWork(body);
    return Response.json({ success: true, data: result });
  } catch (err) {
    console.error('[route]', err);
    return errorResponse('AGENT_ERROR', 'Server error', 500);
  }
}
```

---

### 5.7 `app/api/chat/route.ts`

```typescript
import { z } from 'zod';
import { convertToCoreMessages, type UIMessage } from 'ai';
import { runAgent } from '@/lib/agent';
import { getHistory, appendMessage } from '@/lib/conversation';
import { trackAndMaybeGenerateFaq } from '@/lib/faq-manager';
import { errorResponse } from '@/lib/errors';

const bodySchema = z.object({
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    parts: z.array(z.any()),
    content: z.string().optional(),
  })),
  threadId: z.string().min(1),
});

export const maxDuration = 60; // Allow long agent runs on Vercel

export async function POST(req: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid request body', 400, err);
  }

  const { messages, threadId } = body;
  const lastMessage = messages.at(-1);

  if (!lastMessage || lastMessage.role !== 'user') {
    return errorResponse('VALIDATION_ERROR', 'Last message must be from user', 400);
  }

  const userText = lastMessage.content ?? '';

  // Non-blocking FAQ tracking
  trackAndMaybeGenerateFaq(userText).catch(err =>
    console.error('[FAQ] tracking failed:', err),
  );

  try {
    const history = await getHistory(threadId);
    const historyMessages = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const result = runAgent({
      messages: [...historyMessages, ...convertToCoreMessages(messages as UIMessage[])],
      threadId,
    });

    // Persist after stream completes — non-blocking
    result.then(async r => {
      const text = await r.text;
      await appendMessage(threadId, { role: 'user', content: userText, timestamp: new Date() });
      await appendMessage(threadId, { role: 'assistant', content: text, timestamp: new Date() });
    }).catch(err => console.error('[Chat] persistence failed:', err));

    return (await result).toUIMessageStreamResponse();
  } catch (err) {
    console.error('[Chat] agent error:', err);
    return errorResponse('AGENT_ERROR', 'Agent failed to process request', 500);
  }
}
```

---

### 5.8 `app/api/crawl/route.ts` — SSE Progress Stream

```typescript
import { z } from 'zod';
import { crawlAndVectorize } from '@/lib/crawl';
import { verifyAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/errors';

const bodySchema = z.object({
  url: z.string().url(),
  threadId: z.string().min(1),
  maxDepth: z.coerce.number().min(1).max(5).optional(),
  maxBreadth: z.coerce.number().min(1).max(100).optional(),
  limit: z.coerce.number().min(1).max(500).optional(),
  extractDepth: z.enum(['basic', 'advanced']).optional(),
  instructions: z.string().optional(),
  selectPaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  if (!verifyAdmin(req)) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return errorResponse('VALIDATION_ERROR', 'Invalid input', 400, err);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

      try {
        send({ type: 'status', message: `Starting crawl of ${body.url}` });
        const count = await crawlAndVectorize({
          ...body,
          onProgress: (page, total) => send({ type: 'progress', page, total }),
        });
        send({ type: 'complete', documentsIndexed: count });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Crawl failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

---

### 5.9 `lib/crawl.ts`

```typescript
import { tavily } from '@tavily/core';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';
import { env } from './env';
import { embeddings } from './providers';
import { getMongoCollection } from './vectorstore';

interface CrawlOptions {
  url: string;
  threadId: string;
  maxDepth?: number;
  maxBreadth?: number;
  limit?: number;
  extractDepth?: 'basic' | 'advanced';
  instructions?: string;
  selectPaths?: string[];
  excludePaths?: string[];
  allowExternal?: boolean;
  format?: 'markdown' | 'text';
  onProgress?: (page: number, total: number) => void;
}

export async function crawlAndVectorize(opts: CrawlOptions): Promise<number> {
  const client = tavily({ apiKey: env.TAVILY_API_KEY });

  const selectPaths = opts.selectPaths
    ?? env.CRAWL_SELECT_PATHS?.split(',').map(p => p.trim()).filter(Boolean);
  const excludePaths = opts.excludePaths
    ?? env.CRAWL_EXCLUDE_PATHS?.split(',').map(p => p.trim()).filter(Boolean);

  const crawlResponse = await client.crawl(opts.url, {
    maxDepth: opts.maxDepth ?? env.CRAWL_MAX_DEPTH,
    maxBreadth: opts.maxBreadth ?? env.CRAWL_MAX_BREADTH,
    limit: opts.limit ?? env.CRAWL_LIMIT,
    extractDepth: opts.extractDepth ?? env.CRAWL_EXTRACT_DEPTH,
    instructions: opts.instructions ?? env.CRAWL_INSTRUCTIONS,
    selectPaths: selectPaths?.length ? selectPaths : undefined,
    excludePaths: excludePaths?.length ? excludePaths : undefined,
    allowExternal: opts.allowExternal ?? env.CRAWL_ALLOW_EXTERNAL,
    format: opts.format ?? env.CRAWL_FORMAT,
  });

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const documents: Document[] = [];
  const total = crawlResponse.results.length;

  for (let i = 0; i < total; i++) {
    const result = crawlResponse.results[i];
    opts.onProgress?.(i + 1, total);

    const chunks = await splitter.createDocuments([result.rawContent], [{
      url: result.url,
      title: result.title,
      thread_id: opts.threadId,
      base_url: opts.url,
      timestamp: new Date().toISOString(),
    }]);
    documents.push(...chunks);
  }

  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  await MongoDBAtlasVectorSearch.fromDocuments(documents, embeddings, {
    collection,
    indexName: env.VECTOR_INDEX_NAME,
    textKey: 'text',
    embeddingKey: 'embedding',
  });

  return documents.length;
}

export async function deleteCrawlData(threadId: string): Promise<number> {
  const collection = await getMongoCollection(env.VECTOR_COLLECTION);
  const result = await collection.deleteMany({ 'metadata.thread_id': threadId });
  return result.deletedCount;
}
```

---

### 5.10 `lib/faq-manager.ts`

```typescript
import { generateText } from 'ai';
import { chatModel } from './providers';
import { getMongoCollection } from './vectorstore';
import { FAQ_SYNTHESIS_PROMPT } from './agent/prompts';
import { env } from './env';

export async function trackAndMaybeGenerateFaq(question: string): Promise<void> {
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  const normalized = question.toLowerCase().trim();

  const result = await col.findOneAndUpdate(
    { normalized },
    {
      $inc: { count: 1 },
      $setOnInsert: { question, normalized, answer: null, public: false, createdAt: new Date() },
      $set: { updatedAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  );

  if (result && result.count >= env.FAQ_THRESHOLD && !result.answer) {
    await synthesizeFaqAnswer(result._id.toString(), question);
  }
}

async function synthesizeFaqAnswer(faqId: string, question: string) {
  const { text } = await generateText({
    model: chatModel,
    prompt: FAQ_SYNTHESIS_PROMPT.replace('{QUESTION}', question),
  });

  const col = await getMongoCollection(env.FAQ_COLLECTION);
  await col.updateOne(
    { _id: { $oid: faqId } as any },
    { $set: { answer: text, public: false, pendingApproval: true } }, // admin approves before public
  );
}

export async function getPublicFaqs(limit = 10) {
  const col = await getMongoCollection(env.FAQ_COLLECTION);
  return col
    .find({ public: true, answer: { $ne: null } })
    .sort({ count: -1 })
    .limit(limit)
    .toArray();
}
```

---

## 6. AI Elements Components

> Reference: https://elements.ai-sdk.dev/llms.txt

### Installation

```bash
npx ai-elements@latest add message
npx ai-elements@latest add conversation
npx ai-elements@latest add prompt-input
npx ai-elements@latest add inline-citation
npx ai-elements@latest add confirmation
npx ai-elements@latest add attachments
```

After installing `message`, add to `app/globals.css`:
```css
@source "../node_modules/streamdown/dist/*.js";
```

### Component Usage Map

| Component | Location | Purpose |
|---|---|---|
| `Message`, `MessageContent`, `MessageResponse` | `ChatMessages.tsx` | Each chat turn — markdown rendering, streaming, distinct user/assistant styling |
| `MessageActions`, `MessageAction` | `ChatMessages.tsx` | Copy + regenerate buttons on assistant messages |
| `Conversation`, `ConversationContent` | `ChatInterface.tsx` | Auto-scrolling container |
| `ConversationScrollButton` | `ChatInterface.tsx` | Floating scroll-to-bottom button |
| `ConversationEmptyState` | `ChatMessages.tsx` | Placeholder before first message |
| `ConversationDownload` | `ChatInterface.tsx` | Download chat as Markdown |
| `PromptInput`, `PromptInputTextarea`, `PromptInputSubmit` | `ChatInput.tsx` | Auto-resizing input, streaming-aware submit |
| `PromptInputFooter`, `PromptInputTools`, `PromptInputButton` | `ChatInput.tsx` | Toolbar with action buttons |
| `InlineCitation`, `InlineCitationCard`, `InlineCitationCardTrigger` | `ChatMessages.tsx` | Hover-to-reveal source chips |
| `InlineCitationSource`, `InlineCitationQuote` | `ChatMessages.tsx` | Source title, URL, excerpt |
| `InlineCitationCarousel*` | `ChatMessages.tsx` | Multi-source navigation in one chip |
| `Confirmation`, `ConfirmationRequest`, `ConfirmationActions`, `ConfirmationAction` | `KnowledgeBaseTable.tsx` | Delete confirmation in admin |
| `Attachments`, `Attachment`, `AttachmentPreview`, `AttachmentRemove` | `ChatInput.tsx` | File upload in prompt (future) |

### `components/chat/ChatMessages.tsx`

```tsx
'use client';

import { type UIMessage } from 'ai';
import {
  Message, MessageContent, MessageResponse,
  MessageActions, MessageAction,
} from '@/components/ai-elements/message';
import {
  InlineCitation, InlineCitationCard, InlineCitationCardTrigger,
  InlineCitationCardBody, InlineCitationCarousel,
  InlineCitationCarouselContent, InlineCitationCarouselItem,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import { CopyIcon, RefreshCcwIcon } from 'lucide-react';
import { Fragment } from 'react';

interface Source { url: string; title?: string; content: string; }
interface Props {
  messages: UIMessage[];
  sources: Record<string, Source[]>; // messageId → tool result sources
  onRegenerate: () => void;
}

export function ChatMessages({ messages, sources, onRegenerate }: Props) {
  if (messages.length === 0) {
    return (
      <ConversationEmptyState
        title="Ask anything about the university"
        description="I can help with admissions, programs, tuition, campus life, and more."
      />
    );
  }

  return (
    <>
      {messages.map((message, idx) => {
        const isLast = idx === messages.length - 1;
        const msgSources = sources[message.id] ?? [];

        return (
          <Fragment key={message.id}>
            <Message from={message.role}>
              <MessageContent>
                {message.parts.map((part, i) =>
                  part.type === 'text' ? (
                    <MessageResponse key={`${message.id}-${i}`}>
                      {(part as any).text}
                    </MessageResponse>
                  ) : null,
                )}
              </MessageContent>
            </Message>

            {message.role === 'assistant' && isLast && (
              <MessageActions>
                <MessageAction
                  label="Copy"
                  onClick={() => {
                    const text = message.parts
                      .filter(p => p.type === 'text')
                      .map(p => (p as any).text)
                      .join('');
                    navigator.clipboard.writeText(text);
                  }}
                >
                  <CopyIcon className="size-3" />
                </MessageAction>
                <MessageAction label="Regenerate" onClick={onRegenerate}>
                  <RefreshCcwIcon className="size-3" />
                </MessageAction>
              </MessageActions>
            )}

            {msgSources.length > 0 && message.role === 'assistant' && (
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                {msgSources.map((source, i) => (
                  <InlineCitation key={i}>
                    <InlineCitationCard>
                      <InlineCitationCardTrigger sources={[source.url]} />
                      <InlineCitationCardBody>
                        <InlineCitationCarousel>
                          <InlineCitationCarouselContent>
                            <InlineCitationCarouselItem>
                              <InlineCitationSource
                                title={source.title ?? source.url}
                                url={source.url}
                                description={source.content.slice(0, 120) + '…'}
                              />
                            </InlineCitationCarouselItem>
                          </InlineCitationCarouselContent>
                        </InlineCitationCarousel>
                      </InlineCitationCardBody>
                    </InlineCitationCard>
                  </InlineCitation>
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
    </>
  );
}
```

### `components/chat/ChatInput.tsx`

```tsx
'use client';

import {
  PromptInput, PromptInputBody, PromptInputFooter,
  PromptInputTextarea, PromptInputSubmit, PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from '@ai-sdk/react';

interface Props {
  onSubmit: (message: PromptInputMessage) => void;
  status: ChatStatus;
}

export function ChatInput({ onSubmit, status }: Props) {
  return (
    <PromptInput onSubmit={onSubmit} className="w-full max-w-3xl mx-auto">
      <PromptInputBody>
        <PromptInputTextarea placeholder="Ask about admissions, programs, tuition…" />
      </PromptInputBody>
      <PromptInputFooter>
        <PromptInputTools />
        <PromptInputSubmit status={status} />
      </PromptInputFooter>
    </PromptInput>
  );
}
```

---

## 7. Error Handling & Confirmation Patterns

### Client-Side Chat Errors

Use `useChat`'s `error` and `reload` for inline error recovery:

```tsx
const { messages, error, status, reload } = useChat({ api: '/api/chat' });

{error && (
  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
    <AlertCircleIcon className="size-4 shrink-0" />
    <span>Something went wrong. </span>
    <button onClick={() => reload()} className="underline font-medium">Try again</button>
  </div>
)}
```

### Admin Destructive Actions — Confirmation Component

Uses AI Elements `Confirmation` to gate delete actions in `KnowledgeBaseTable.tsx`:

```tsx
import {
  Confirmation, ConfirmationRequest,
  ConfirmationActions, ConfirmationAction,
} from '@/components/ai-elements/confirmation';

<Confirmation approval={deleteApproval} state={deleteState}>
  <ConfirmationRequest>
    Delete all indexed content for <strong>{domain}</strong>? This cannot be undone.
  </ConfirmationRequest>
  <ConfirmationActions>
    <ConfirmationAction variant="outline" onClick={onCancel}>Cancel</ConfirmationAction>
    <ConfirmationAction variant="destructive" onClick={onConfirm}>Delete</ConfirmationAction>
  </ConfirmationActions>
</Confirmation>
```

### Toast Notifications (shadcn/ui)

```tsx
// After successful crawl:
toast({ title: 'Crawl complete', description: `${count} pages indexed.` });
// After domain delete:
toast({ title: 'Domain removed', variant: 'destructive' });
// After copy:
toast({ title: 'Copied to clipboard', duration: 1500 });
```

### Form Validation (Zod inline errors)

```tsx
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

const handleSubmit = () => {
  const result = crawlFormSchema.safeParse(formData);
  if (!result.success) {
    const errors: Record<string, string> = {};
    result.error.errors.forEach(e => { errors[String(e.path[0])] = e.message; });
    setFieldErrors(errors);
    return;
  }
  // proceed
};

// In JSX:
{fieldErrors.url && <p className="text-destructive text-xs mt-1">{fieldErrors.url}</p>}
```

---

## 8. UI Architecture

### Dual-Surface Design

```
PUBLIC (/)                         ADMIN (/admin)
──────────────────────────         ──────────────────────────
Landing: Hero + FAQ (ISR 1hr)      Domain Registry + Crawl Trigger
Chat: Session + Messages           Knowledge Base Status Table
      + Sources panel              FAQ Approval Queue
      + Citation chips
No auth required                   Protected by ADMIN_SECRET bearer token
```

### Chat Layout (Three-Column)

```
┌──────────────────────────────────────────────────────────────┐
│ HEADER: [University Logo]          [New Chat] [Theme Toggle] │
├──────────────┬─────────────────────────────┬─────────────────┤
│ LEFT SIDEBAR │      MAIN CHAT              │  SOURCES PANEL  │
│              │                             │                 │
│ Chat History │  <Conversation>             │ Per-message     │
│ • Session 1  │    <ChatMessages />         │ source cards    │
│ • Session 2  │    (AI Elements)            │ (InlineCitation │
│              │                             │  hover cards)   │
│              │  Citation chips ────────►   │                 │
│              │  [source 1] [source 2]      │ Updates with    │
│              │                             │ each response   │
│              │  <ChatInput />              │                 │
│              │  (AI Elements PromptInput)  │                 │
└──────────────┴─────────────────────────────┴─────────────────┘
```

Mobile: sidebar → drawer, sources panel → bottom sheet via "Sources (N)" badge.

### Landing Page

```
┌─────────────────────────────────────────┐
│  [University Name] Knowledge Base        │
│  "Get instant answers about…"            │
│         [ Start Chatting → ]             │
├─────────────────────────────────────────┤
│  Frequently Asked Questions              │
│  (GET /api/faqs — ISR, revalidate 3600) │
│                                          │
│  ▼ What are admission requirements?      │
│    [AI-synthesized answer ≤150 words]    │
│  ▼ How much is tuition per semester?     │
│    [AI-synthesized answer]               │
└─────────────────────────────────────────┘
```

### Admin Dashboard

```
┌──────────────────────────────────────────────────────┐
│ Add Domain                                            │
│ URL: [https://university.edu ________________]        │
│ ▼ Crawl Options                                      │
│   Depth [2]  Breadth [20]  Limit [100]               │
│   Extract [advanced ▼]  Instructions [optional]      │
│   Include [/academics/*, /admissions/*]               │
│   Exclude [/admin/*, /login/*]                        │
│                         [ Crawl & Index → ]           │
├──────────────────────────────────────────────────────┤
│ Live Progress (SSE)                                   │
│ ██████░░░░░ 45/100 pages — /academics/cs              │
├──────────────────────────────────────────────────────┤
│ Indexed Domains        Docs    Last Crawl    Actions  │
│ university.edu/...    1,240   Feb 18 2026   [Re-index]│
│                                              [Delete⚠]│
└──────────────────────────────────────────────────────┘
```

---

## 9. MongoDB Atlas Setup

### Vector Index (create in Atlas UI on `crawled_index`)

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 2048, "similarity": "cosine" },
    { "type": "filter", "path": "metadata.thread_id" },
    { "type": "filter", "path": "metadata.base_url" }
  ]
}
```

> `numDimensions` must match `EMBEDDING_DIMENSIONS`. Voyage `voyage-4-large` = `2048`, OpenAI `text-embedding-3-large` = `3072`.

### Collections

| Collection | Purpose | Indexes |
|---|---|---|
| `crawled_index` | Vector store | Atlas Vector Search index |
| `conversations` | Chat history | `{ threadId: 1 }` |
| `faqs` | FAQ tracking + answers | `{ normalized: 1 }` unique, `{ public: 1, count: -1 }` |
| `domains` | Admin-registered domains | `{ url: 1 }` unique |
| `checkpoints_aio` | Reserved | — |
| `checkpoint_writes_aio` | Reserved | — |

---

## 10. Admin Authentication

```typescript
// middleware.ts — protects /admin/* and /api/crawl /api/domains
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const token = request.cookies.get('admin_token')?.value
      ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (token !== process.env.ADMIN_SECRET) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/crawl/:path*', '/api/domains/:path*'],
};
```

For university SSO (SAML/OIDC), replace the cookie check with `next-auth` — the middleware interface stays identical.

---

## 11. Deployment

### Vercel (Recommended)

1. Push repo to GitHub/GitLab → import at vercel.com
2. Add all env vars under **Settings → Environment Variables**
3. Mark `ADMIN_SECRET` as sensitive
4. Add to `app/api/chat/route.ts`: `export const maxDuration = 60;`
5. Deploy

No extra config needed — App Router, SSE streaming, and ISR work natively.

---

### Render

1. **Web Service** → connect repo
2. Build: `npm run build`  |  Start: `node .next/standalone/server.js`
3. Add to `next.config.ts`:
   ```typescript
   const nextConfig = { output: 'standalone' };
   export default nextConfig;
   ```
4. Add env vars in **Environment** tab

---

### Netlify

1. Connect repo — `@netlify/plugin-nextjs` is auto-applied
2. Add env vars in **Site configuration → Environment variables**
3. For longer agent runs, add `netlify.toml`:
   ```toml
   [functions]
   timeout = 60
   ```

ISR, App Router, and streaming all work via the Next.js plugin.

---

### Pre-Deploy Env Checklist

```
✅ CHAT_API_KEY + CHAT_BASE_URL + CHAT_MODEL
✅ EMBEDDING_API_KEY + EMBEDDING_BASE_URL + EMBEDDING_MODEL + EMBEDDING_DIMENSIONS
✅ MONGODB_URI + DB_NAME
✅ TAVILY_API_KEY
✅ ADMIN_SECRET (≥16 chars)
✅ NEXT_PUBLIC_APP_NAME + NEXT_PUBLIC_APP_URL
✅ CRAWL_* defaults (or rely on code defaults)
```

---

## 12. Package Installation

```bash
npm install next@15 react react-dom typescript
npm install ai @ai-sdk/react @ai-sdk/openai
npm install @langchain/mongodb @langchain/openai @langchain/textsplitters @langchain/core
npm install @tavily/core mongodb zod nanoid
npm install tailwindcss @tailwindcss/typography
npx shadcn@latest init
npx ai-elements@latest add message conversation prompt-input inline-citation confirmation attachments
```

---

## 13. Development Standards

- **Env access**: Only via `lib/env.ts` — never `process.env` directly in components or routes
- **Error responses**: Always use `errorResponse()` from `lib/errors.ts` — sanitise stack traces in production
- **Agent extensibility**: New tools → `lib/agent/tools.ts`. New prompt variants → `lib/agent/prompts.ts`. Neither requires touching route handlers.
- **MongoDB client**: Singleton in `lib/vectorstore.ts` — never instantiate `MongoClient` in route handlers
- **Git**: Conventional commits with scope (`feat(agent): add calendar tool`, `fix(crawl): handle empty pages`)
- **Lint**: `eslint` + `@typescript-eslint/recommended`, run pre-push

---

## 14. Changelog vs Previous Draft

| Area | Change |
|---|---|
| **Docker** | Removed — replaced with Vercel, Render, Netlify guides |
| **Agent module** | Refactored into `lib/agent/` (prompts.ts, tools.ts, index.ts) for extensibility |
| **System prompt** | Full prompt added to `lib/agent/prompts.ts` — mirrors `backend/prompts.py` |
| **FAQ prompt** | `FAQ_SYNTHESIS_PROMPT` added, referenced from `faq-manager.ts` |
| **Tool registry** | Tools as named exports — add without changing agent entry point |
| **Error handling** | `AppError` type + `errorResponse()` + client recovery patterns |
| **Confirmations** | `Confirmation` AI Elements component spec for admin destructive actions |
| **AI Elements** | Full component map + `ChatMessages.tsx` + `ChatInput.tsx` reference implementations |
| **Reference LLMs** | Table of all LLM.txt URLs at document top |
| **FAQ approval** | FAQ auto-synthesized answers go to `pendingApproval: true` before admin promotes to `public: true` |
