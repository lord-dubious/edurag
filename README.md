# EduRAG — University Knowledge Base

A self-hostable RAG knowledge base for universities built with **Next.js 16**, **Vercel AI SDK 6**, **MongoDB Atlas Vector Search**, and **Tavily**.

Administrators crawl and index institutional content via a protected backend dashboard. Students interact with a public chat UI that surfaces cited answers and auto-generated FAQs.

---

## Features

- **Knowledge Ingestion** — Admin crawls institutional URLs via Tavily, chunks, embeds, and stores in MongoDB Atlas Vector Search
- **Conversational RAG** — Students query an AI agent with semantic vector search, streamed cited answers
- **Auto-FAQ Generation** — Frequently asked questions are tracked and auto-synthesized
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
CHAT_API_KEY=your-llm-api-key
CHAT_BASE_URL=https://api.cerebras.ai/v1  # or https://api.openai.com/v1
CHAT_MODEL=gpt-oss-120b                    # or gpt-4o, llama-3.3-70b, etc.

EMBEDDING_API_KEY=your-voyage-api-key
EMBEDDING_BASE_URL=https://api.voyageai.com/v1
EMBEDDING_MODEL=voyage-4-large
EMBEDDING_DIMENSIONS=2048

MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net
TAVILY_API_KEY=tvly-your-key
ADMIN_SECRET=your-secure-admin-token-min-16-chars
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

## Project Structure

```
edurag/
├── app/
│   ├── (public)/
│   │   ├── page.tsx              # Landing page (ISR)
│   │   └── chat/page.tsx         # Student chat UI
│   ├── admin/
│   │   ├── layout.tsx            # Auth guard
│   │   ├── login/page.tsx        # Token login
│   │   ├── page.tsx              # Dashboard
│   │   ├── domains/page.tsx      # Domain management
│   │   └── faqs/page.tsx         # FAQ approval
│   └── api/
│       ├── chat/route.ts         # Streaming chat
│       ├── crawl/route.ts        # SSE crawl progress
│       ├── domains/route.ts      # Domain CRUD
│       ├── faqs/route.ts         # Public FAQs
│       └── threads/route.ts      # Conversation management
├── lib/
│   ├── agent/
│   │   ├── index.ts              # Agent entry point
│   │   ├── prompts.ts            # System prompts
│   │   ├── tools.ts              # Tool registry
│   │   └── types.ts              # Agent types
│   ├── providers.ts              # LLM + Embedding factories
│   ├── vectorstore.ts            # MongoDB vector store
│   ├── conversation.ts           # Chat history
│   ├── crawl.ts                  # Tavily crawl pipeline
│   ├── faq-manager.ts            # FAQ tracking
│   ├── auth.ts                   # Admin auth
│   ├── errors.ts                 # Error handling
│   └── env.ts                    # Zod-validated env
└── components/
    ├── chat/                     # Chat UI components
    ├── landing/                  # Landing page components
    ├── admin/                    # Admin UI components
    └── ai-elements/              # AI Elements primitives
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

1. Navigate to `/chat`
2. Ask questions about the university
3. View cited answers with source links
4. Session history saved in sidebar

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
| `CHAT_API_KEY` | LLM API key | ✅ |
| `CHAT_BASE_URL` | LLM API endpoint | ✅ |
| `CHAT_MODEL` | Model name | ✅ |
| `EMBEDDING_API_KEY` | Embedding API key | ✅ |
| `EMBEDDING_BASE_URL` | Embedding endpoint | ✅ |
| `EMBEDDING_MODEL` | Embedding model | ✅ |
| `EMBEDDING_DIMENSIONS` | Vector dimensions (must match index) | ✅ |
| `MONGODB_URI` | MongoDB Atlas connection string | ✅ |
| `TAVILY_API_KEY` | Tavily crawl API key | ✅ |
| `ADMIN_SECRET` | Admin auth token (min 16 chars) | ✅ |
| `FAQ_THRESHOLD` | Questions before FAQ synthesis | Default: 5 |
| `CRAWL_*` | Crawl defaults | Optional |

---

## Tech Stack

| Layer | Package |
|-------|---------|
| Framework | Next.js 16 |
| AI SDK | Vercel AI SDK 6 |
| Vector Store | @langchain/mongodb |
| Embeddings | @langchain/openai |
| Crawling | @tavily/core |
| Database | MongoDB 6.x |
| Validation | Zod |
| UI | shadcn/ui, AI Elements, Tailwind |

---

## License

MIT