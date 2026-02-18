# EduRAG Architecture & Technical Specification (Build Mode)

## Project Summary
EduRAG is an automated, self-learning Knowledge Assistant for educational institutions. It leverages deep web crawling to build a dynamic vector knowledge base and employs an autonomous agent to answer student/faculty queries with citations.

### System Flow
1.  **Crawl (Tavily)**: Ingests educational URLs and converts them to structured markdown.
2.  **Embed (Google)**: Generates 3072-dimensional vectors using `gemini-embedding-001`.
3.  **Store (MongoDB Atlas)**: Persists vectors and conversational history with thread-level isolation.
4.  **Chat (AI SDK v6)**: An autonomous agent manages multi-step tool calls to retrieve context and generate citation-backed responses.
5.  **Self-Learn (FAQ Engine)**: Tracks query patterns and automatically synthesizes a categorised FAQ when thresholds are met.

---

## Technical Stack

| Layer | Implementation |
| :--- | :--- |
| **Framework** | Next.js 15 (App Router) |
| **Orchestration** | Vercel AI SDK v6 |
| **Primary LLM** | Google Gemini 2.5 Flash |
| **Fallback LLM** | Cerebras (gpt-oss-120b) |
| **Embeddings** | Google Gemini (3072 dims) |
| **Vector DB** | MongoDB Atlas Vector Search |
| **Crawling** | Tavily Core JS SDK |
| **UI/UX** | AI SDK Elements + shadcn/ui + Tailwind CSS |

---

## Core Components & Logic

### 1. The Autonomous Agent (`lib/agent-tools.ts`)
The agent uses a **Thought -> Action -> Observation** cycle. 
- **Tools**: `vector_search`, `faq_search`, `track_question`, `update_faq`.
- **System Prompt**: Enforces strict grounding in crawled data and mandates in-text URL citations.

### 2. Intelligent Crawling (`lib/crawl.ts`)
Uses the official Tavily JS method (`client.crawl`) with `format: 'text'`. This automatically handles depth and discovery, passing cleaned content directly to the vectorisation pipeline.

### 3. Vector Operations (`lib/vector-store.ts`)
- **Isolation**: Every document is tagged with a `threadId` for session-specific context.
- **Search**: Utilises `$vectorSearch` with a pre-configured Atlas index.
- **Persistence**: Saves every user and assistant message to MongoDB for long-term thread memory.

### 4. Self-Updating FAQ (`lib/faq-manager.ts`)
- **Normalization**: Standardizes similar questions to track frequency.
- **Generation**: Once a question hits the `FAQ_THRESHOLD` (default: 5), the system uses `generateText` with structured output to create a verified answer and category.

---

## Database Schema

### `vector_index` (Collection)
```json
{
  "_id": "uuid",
  "content": "string",
  "embedding": [3072 floats],
  "metadata": {
    "url": "string",
    "threadId": "string",
    "favicon": "string",
    "crawledAt": "timestamp"
  }
}
```

### `conversations` (Collection)
Stores thread history to maintain context across browser refreshes.

---

## Environment Configuration

| Variable | Requirement |
| :--- | :--- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Primary Gemini Access |
| `PRIMARY_CHAT_MODEL` | `gemini-2.5-flash` |
| `EMBEDDING_MODEL` | `gemini-embedding-001` |
| `EMBEDDING_DIMENSIONS` | `3072` |
| `MONGODB_URI` | MongoDB Atlas Connection |
| `TAVILY_API_KEY` | Tavily Search Access |
| `FALLBACK_MODEL` | `gpt-oss-120b` (Cerebras) |

---

## MCP Configuration (`opencode.json`)
Enabled with **Context7** server for real-time documentation retrieval during future builds/updates.
