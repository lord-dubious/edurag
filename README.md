# EduRAG — University Knowledge Base

A self-hostable RAG knowledge base for universities built with **Next.js 16**, **Vercel AI SDK 6**, **MongoDB Atlas Vector Search**, and **Tavily**.

Administrators crawl and index institutional content via a protected backend dashboard. Students interact with a public chat UI that surfaces cited answers and auto-generated FAQs.

---

## Features

- **Knowledge Ingestion** — Admin crawls institutional URLs via Tavily, chunks, embeds, and stores in MongoDB Atlas Vector Search
- **Conversational RAG** — Students query an AI agent with semantic vector search, streamed cited answers
- **Voice Agent** — High-fidelity voice interaction powered by **Deepgram** (Nova-3 STT & Aura-2 TTS)
- **Auto-FAQ Generation** — Frequently asked questions are tracked and auto-synthesized
- **Automated Onboarding** — Streamlined setup for branding, API configuration, and initial indexing
- **AI Elements UI** — Production-grade chat components with citations
- **Admin Dashboard** — Domain management, crawl progress, FAQ approval queue

---

## Quick Start

### 1. Prerequisites

- Node.js 18+ 
- MongoDB Atlas account (for vector search)
- Tavily API key
- OpenAI-compatible LLM API (Cerebras, OpenAI, etc.)
- Embedding API (Voyage AI recommended)

### 2. Install Dependencies

```bash
git clone <your-repo>
cd edurag
npm install
```

### 3. Environment Setup

Copy the example environment file:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your credentials:

```bash
# Required
AUTH_SECRET=your-random-32-char-secret
AUTH_URL=http://localhost:3000
CHAT_API_KEY=your-llm-api-key
CHAT_BASE_URL=https://api.cerebras.ai/v1
CHAT_MODEL=gpt-oss-120b

EMBEDDING_API_KEY=your-voyage-api-key
EMBEDDING_BASE_URL=https://api.voyageai.com/v1
EMBEDDING_MODEL=voyage-4-large
EMBEDDING_DIMENSIONS=2048

MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
TAVILY_API_KEY=tvly-your-key
ADMIN_SECRET=your-secure-admin-token-min-16-chars

# Voice Agent (Deepgram)
DEEPGRAM_API_KEY=your-deepgram-key
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_TTS_MODEL=aura-2-thalia-en

# Optional
UNIVERSITY_URL=https://university.edu
UPLOADTHING_SECRET=sk_live_...
UPLOADTHING_APP_ID=...
```

### 4. MongoDB Atlas Vector Search Setup

#### Step 1: Create a MongoDB Atlas Cluster

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free M0 cluster or use an existing one
3. Create a database user with read/write permissions
4. Whitelist your IP address (or `0.0.0.0/0` for development)

#### Step 2: Get Your Connection String

1. Click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string and replace `<password>` with your database user password
4. Set this as `MONGODB_URI` in `.env.local`

#### Step 3: Create the Vector Search Index

1. Go to your cluster → **Atlas Search** → **Create Search Index**
2. Choose **JSON Editor**
3. Select the database (`edurag`) and collection (`crawled_index`)
4. Paste this index definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 2048,
      "similarity": "cosine"
    }
  ]
}
```

> **Note:** Thread ID filtering is done in code after vector search (post-filter) for maximum accuracy. No filter fields needed in the index.

5. Name the index `index` (matches `VECTOR_INDEX_NAME` in env)
6. Click **Create Search Index**

> **Note:** `numDimensions` must match `EMBEDDING_DIMENSIONS`. 
> - Voyage `voyage-4-large` = `2048`
> - OpenAI `text-embedding-3-large` = `3072`
> - OpenAI `text-embedding-3-small` = `1536`

#### Step 4: Create Additional Indexes (Optional but Recommended)

In the Atlas UI, go to your database and create these indexes:

**`conversations` collection:**
```json
{ "threadId": 1 }
```

**`faqs` collection:**
```json
{ "normalized": 1 }  // unique
{ "public": 1, "count": -1 }
```

**`domains` collection:**
```json
{ "url": 1 }  // unique
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Deploying to Netlify

EduRAG ships with a `netlify.toml` that uses `@netlify/plugin-nextjs` to support App Router, server components, and auth callbacks.

### 1. Install the Netlify Next.js Plugin

```bash
npm install -D @netlify/plugin-nextjs
```

### 2. Set Environment Variables in Netlify Dashboard

Go to **Site Settings → Environment Variables** and add:

| Variable | Value | Required |
|----------|-------|----------|
| `AUTH_SECRET` | Random 32+ char secret (`npx auth secret`) | Yes |
| `AUTH_URL` | Your full deploy URL e.g. `https://your-site.netlify.app` | Yes |
| `MONGODB_URI` | MongoDB Atlas connection string | Yes |
| `CHAT_API_KEY` | LLM API key | Yes |
| `CHAT_BASE_URL` | LLM base URL | Yes |
| `CHAT_MODEL` | `gpt-oss-120b` | Yes |
| `EMBEDDING_API_KEY` | Voyage AI key | Yes |
| `TAVILY_API_KEY` | Tavily key | Yes |
| `ADMIN_SECRET` | Min 16 chars | Yes |
| `DEEPGRAM_API_KEY` | Deepgram API key | For voice |

> **Important**: `AUTH_URL` must exactly match your Netlify site URL (no trailing slash). Without it, NextAuth redirects back to `localhost` after sign-in.

### 3. Deploy

```bash
# Push to your branch, or trigger a manual deploy in Netlify dashboard
git push origin main
```

---

## Project Structure

```
edurag/
├── app/
│   ├── (public)/
│   │   ├── chat/page.tsx         # Student text chat UI
│   │   ├── voice/page.tsx        # Student voice agent UI
│   │   └── page.tsx              # Landing page
│   ├── admin/
│   │   ├── layout.tsx            # Auth guard
│   │   ├── login/page.tsx        # Token login
│   │   ├── page.tsx              # Dashboard
│   │   ├── domains/page.tsx      # Domain management
│   │   └── faqs/page.tsx         # FAQ approval
│   ├── setup/
│   │   └── page.tsx              # Automated onboarding flow
│   └── api/
│       ├── chat/route.ts         # Streaming text chat
│       ├── voice-token/route.ts  # Deepgram token auth
│       ├── voice-function/route.ts # Voice agent tool calling
│       ├── crawl/route.ts        # SSE crawl progress
│       ├── domains/route.ts      # Domain CRUD
│       ├── faqs/route.ts         # Public FAQs
│       └── threads/route.ts      # Conversation management
├── lib/
│   ├── voice/                    # Deepgram & Voice logic
│   ├── agent/                    # App-specific agent wiring
│   ├── providers.ts              # LLM + Embedding factories
│   ├── vectorstore.ts            # MongoDB vector store
│   ├── crawl.ts                  # Tavily crawl pipeline
│   ├── auth.ts                   # Admin auth
│   ├── env.ts                    # Zod-validated env
│   └── errors.ts                 # Error handling
└── packages/
    └── agent/                    # Core Agent Orchestration logic
```

---

## Usage

### Admin Dashboard

1. Navigate to `/admin/login`
2. Enter your `ADMIN_SECRET` token
3. Add a domain URL to crawl (e.g., `https://university.edu`)
4. Configure crawl options (depth, breadth, limit, paths)
5. Click "Crawl & Index" — watch live SSE progress
6. Review and approve auto-generated FAQs

### Student Chat

1. Navigate to `/chat` for text-based interaction.
2. Navigate to `/voice` for real-time voice interaction.
3. Ask questions about the university and view cited answers.
4. Session history is saved automatically in the sidebar.

---

## API Reference

### POST `/api/chat`

Streaming chat endpoint using Vercel AI SDK.

**Request:**
```json
{
  "messages": [{ "id": "x", "role": "user", "content": "What are admission requirements?" }],
  "threadId": "session-123"
}
```

**Response:** SSE stream with `toUIMessageStreamResponse()`

### POST `/api/crawl`

Admin-only crawl endpoint with SSE progress.

**Request:**
```json
{
  "url": "https://university.edu",
  "threadId": "domain-123",
  "maxDepth": 2,
  "maxBreadth": 20,
  "limit": 100
}
```

**Response:** SSE events `{ type: 'status'|'progress'|'complete'|'error' }`

### GET `/api/faqs`

Public FAQ list (ISR cached).

### GET|POST|DELETE `/api/domains`

Admin-only domain registry CRUD.

---

## Deployment

### Vercel (Recommended)

1. Push repo to GitHub
2. Import at [vercel.com](https://vercel.com)
3. Add all environment variables
4. Mark `ADMIN_SECRET` as sensitive
5. Deploy

### Render

1. Create a **Web Service**
2. Build: `npm run build`
3. Start: `node .next/standalone/server.js`
4. Add `output: 'standalone'` to `next.config.ts`

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

---

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `AUTH_SECRET` | Random 32+ character secret, e.g., generated with `npx auth secret` | Yes |
| `AUTH_URL` | Full deploy URL or localhost during development | Yes |
| `CHAT_API_KEY` | LLM API key | Yes |
| `CHAT_BASE_URL` | LLM API endpoint | Yes |
| `CHAT_MODEL` | Model name | Yes |
| `EMBEDDING_API_KEY` | Embedding API key | Yes |
| `EMBEDDING_BASE_URL` | Embedding endpoint | Yes |
| `EMBEDDING_MODEL` | Embedding model | Yes |
| `EMBEDDING_DIMENSIONS` | Vector dimensions (must match index) | Yes |
| `MONGODB_URI` | MongoDB Atlas connection string | Yes |
| `TAVILY_API_KEY` | Tavily crawl API key | Yes |
| `ADMIN_SECRET` | Admin auth token (min 16 chars) | Yes |
| `DEEPGRAM_API_KEY` | Deepgram API key | For voice |
| `DEEPGRAM_STT_MODEL` | Deepgram STT model | For voice |
| `DEEPGRAM_TTS_MODEL` | Deepgram TTS model | For voice |
| `FAQ_THRESHOLD` | Questions before FAQ synthesis | Default: 5 |
| `CRAWL_*` | Crawl defaults | Optional |

---

## Tech Stack

| Layer | Package |
|-------|---------|
| Framework | Next.js 16 |
| AI SDK | Vercel AI SDK 6 |
| Voice | Deepgram (v4 SDK) |
| Core Agent | @edurag/agent (Workspace) |
| Vector Store | @langchain/mongodb |
| LLM Provider | Cerebras (gpt-oss-120b) |
| Embeddings | Voyage AI (voyage-4-large) |
| Crawling | @tavily/core |
| Database | MongoDB Atlas |
| UI | shadcn/ui, AI Elements, Tailwind |

---

## License

MIT