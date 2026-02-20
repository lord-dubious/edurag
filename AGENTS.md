# EduRAG — Agent Instructions

## Project Overview

EduRAG is a self-hostable RAG knowledge base for universities built with Next.js 15, Vercel AI SDK, MongoDB Atlas Vector Search, and Tavily. Students chat with an AI that retrieves from crawled university content, with an admin dashboard for domain management and FAQ approval.

---

## Build/Lint/Test Commands

```bash
# Development
npm run dev              # Start Next.js dev server on http://localhost:3000

# Build
npm run build            # Production build (run before committing changes)
npm run start            # Start production server

# Testing
npm run test             # Run all tests with Vitest
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report

# Run single test file
npx vitest run __tests__/agent-tools.test.ts

# Run single test by name
npx vitest run -t "vector_search tool"

# Type checking
npx tsc --noEmit         # TypeScript type check without emit
```

---

## Code Style Guidelines

### Imports

```typescript
// 1. React/Next.js imports first
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. Third-party libraries (alphabetical)
import { motion } from 'framer-motion';
import { z } from 'zod';

// 3. AI SDK and LangChain imports
import { streamText } from 'ai';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';

// 4. Internal lib imports (use @/ alias for lib/)
import { getChatModel, getEmbeddings } from '@/lib/providers';
import { AGENT_SYSTEM_PROMPT } from '@/lib/agent/prompts';

// 5. Internal components (use @/ alias)
import { Button } from '@/components/ui/button';
import { ChatMessages } from '@/components/chat/ChatMessages';

// 6. Types (use `type` keyword for type-only imports)
import type { UIMessage, ToolResult } from '@/lib/agent/types';
```

### TypeScript Types

- **No `any` types** — Use `unknown` with type guards or define proper interfaces
- **Use `type` for type-only imports**: `import type { Foo } from './types'`
- **Prefer interfaces for object shapes**, type aliases for unions/primitives
- **All function parameters and return types should be typed**

```typescript
// Good
interface VectorSearchResult {
  content: string;
  url: string;
  title: string;
  score: number;
}

async function searchKnowledge(query: string, topK: number): Promise<VectorSearchResult[]> {
  // ...
}

// Bad
async function searchKnowledge(query: any, topK: any) {
  // ...
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `ChatInterface.tsx` |
| Utilities/lib files | camelCase | `vectorstore.ts` |
| API routes | lowercase | `app/api/chat/route.ts` |
| Constants | SCREAMING_SNAKE | `AGENT_SYSTEM_PROMPT` |
| Interfaces | PascalCase, no `I` prefix | `VectorSearchResult` |
| Types | PascalCase | `type Status = 'pending' \| 'approved'` |
| Functions | camelCase | `cleanContent()`, `extractTitle()` |
| React hooks | usePrefix | `useChat()`, `useLocalStorage()` |
| Zod schemas | camelCase + Schema | `crawlOptionsSchema` |

### Formatting

- **No comments** unless explicitly requested by user
- Use **2-space indentation**
- **Single quotes** for strings (except in JSON)
- **Trailing commas** in multiline objects/arrays
- **Semicolons** required

### Error Handling

```typescript
// Use the ApiError class for API errors
import { ApiError } from '@/lib/errors';

// In API routes
if (!domain) {
  throw new ApiError(404, 'Domain not found');
}

// Error response helper
return errorResponse(error instanceof ApiError ? error : new ApiError(500, 'Internal error'));

// In client components
try {
  await mutate(data);
} catch (error) {
  console.error('Failed to save:', error);
  // Show user-friendly message
}
```

---

## AI SDK 6 Specifics

This project uses **Vercel AI SDK 6** with key differences from v4:

```typescript
// tool() uses inputSchema (not parameters)
import { tool } from 'ai';
import { z } from 'zod';

const myTool = tool({
  description: 'Search knowledge base',
  inputSchema: z.object({    // NOT 'parameters'
    query: z.string(),
    topK: z.number().optional(),
  }),
  execute: async ({ query, topK }) => {
    // ...
  },
});

// useChat returns sendMessage (not handleSubmit)
const { messages, sendMessage, status } = useChat({
  api: '/api/chat',
});

// UIMessage.parts is array of TextUIPart | ToolUIPart
// Tool types are 'tool-{NAME}' e.g. 'tool-vector_search'
```

---

## Key Architecture Patterns

### MongoDB Vector Search

- Uses **post-filtering** approach — no filter fields in MongoDB index
- Embeddings: **Voyage AI** with 2048 dimensions (`voyage-4-large`)
- Collection: `crawled_index` with vector index on `embedding` field
- **No threadId filtering** — search returns all documents (single-university setup)
- MongoDB connection uses **global pattern** for Next.js hot reload stability

### Lazy-loaded Providers

Providers are lazy-loaded to avoid env validation at build time:

```typescript
// lib/providers.ts exports functions, not direct instances
import { getChatModel, getEmbeddings } from '@/lib/providers';

// Use in tools/agent
const model = getChatModel();
const embeddings = getEmbeddings();
```

### Content Crawling

- Uses **Tavily JS SDK** with camelCase parameters: `maxDepth`, `rawContent`, `extractDepth`
- Content cleaning removes navigation menus, cookies text, HTML tags
- Chunking: 1500 chars with 300 overlap
- Title extraction from HTML `<title>` tag parsing
- **SSE streaming** for crawl progress — use buffer-based parsing, not line splitting

### Chat Citations

- Supports dual citation formats: `【1†L1-L30】` and `[1]`
- Citations rendered as clickable links to source URLs
- Source previews cleaned of navigation patterns

### Chat Interface

- Uses `react-markdown` for rendering AI responses
- Citations parsed and converted to clickable links
- localStorage persistence for chat history (saved only on stream finish)
- Client-side only rendering to avoid SSR hydration mismatches

### System Prompts

Located in `lib/agent/prompts.ts`. Key instruction: "After using tools, ALWAYS generate a text response."

---

## Component Guidelines

### UI Components

- **AI Elements** for chat UI: `Message`, `Conversation`, `PromptInput`, `InlineCitation`
- **shadcn/ui** for auxiliary components: `Button`, `Card`, `Table`, `Accordion`
- **No custom UI components** — compose from existing libraries only

### React Patterns

```typescript
// Use 'use client' directive for client components
'use client';

// Use React.memo for expensive components
const ChatMessages = React.memo(function ChatMessages({ messages, sources }: Props) {
  // ...
});

// Use useCallback for handlers passed to children
const handleSubmit = useCallback(async (text: string) => {
  await sendMessage(text);
}, [sendMessage]);
```

---

## Environment Variables

Required in `.env.local`:

```
MONGODB_URI=mongodb+srv://...
CHAT_MODEL=gpt-oss-120b
CHAT_API_KEY=...              # Cerebras API key
CHAT_BASE_URL=...             # Cerebras base URL (optional)
TAVILY_API_KEY=...
EMBEDDING_API_KEY=...         # Voyage AI key
ADMIN_TOKEN=...               # Bearer token for admin access

# Optional with defaults
EMBEDDING_MODEL=voyage-4-large
EMBEDDING_DIMENSIONS=2048
CRAWL_MAX_DEPTH=3
CRAWL_LIMIT=300
CRAWL_EXCLUDE_PATHS=/archive/*,/admin/*,/login/*
```

---

## Testing

- Test files in `__tests__/` directory
- Use Vitest with `@testing-library/react`
- Mock MongoDB and external APIs in tests
- Run `npm run build` after code changes to catch type errors

---

## References

- **AI Elements**: https://elements.ai-sdk.dev/llms.txt
- **Vercel AI SDK**: https://ai-sdk.dev/llms.txt
- **Tavily JS SDK**: https://docs.tavily.com/llms.txt
- **MongoDB Atlas**: https://www.mongodb.com/docs/llms.txt
- **Full Architecture**: See `EDURAG_ARCHITECTURE.md`
