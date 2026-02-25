# EduRAG — Agent Instructions

## Project Overview

EduRAG is a self-hostable RAG knowledge base for universities built with Next.js 16, Vercel AI SDK 6, MongoDB Atlas Vector Search, and Tavily. Students chat with an AI that retrieves from crawled university content, with an admin dashboard for domain management and FAQ approval.

---

## Build/Lint/Test Commands

```bash
# Development
npm run dev              # Start Next.js dev server on http://localhost:3000

# Build
npm run build            # Production build (run before committing changes)
npm run start            # Start production server

# Vercel Deployment
# If npm install fails with peer dependency conflicts, use legacy peer deps:
npm install --legacy-peer-deps
# Or ensure .npmrc with 'legacy-peer-deps=true' exists in project root

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

For the Voice Agent, the prompt is in `lib/voice/useDeepgramVoice.ts` via `getSystemPrompt()`.

---

## Unified Agent Persona

The Voice and Text interfaces represent a **single unified entity**.
- **First-person singular**: Use "I", "me", "my". NEVER refer to a "text assistant" or separate agent.
- **Single Identity**: "I speak through voice and type in the chat window."
- **Verbal Highlights**: After triggering a rich text note, ALWAYS provide a brief verbal summary (1-2 sentences) of the highlights so the conversation flow isn't broken.

---

## Voice Agent (Deepgram V1)

### Configuration
- **Standardized Sample Rate**: **24,000 Hz** (24kHz) for both input and output.
- **Handshake Protocol**: Wait for the `Welcome` message before sending the `Settings` message.
- **History Retention**: Always set `flags: { history: true }` in the `Settings` message to inject previous chat context.
- **Audio Format**: Use `encoding: 'linear16'` and `container: 'none'`.

### Voice-to-Text Handoff
- **Trigger**: The tool `show_detailed_notes(topic)` is used for complex info.
- **Internal Chain**: `useDeepgramVoice` (tool call) -> `onRequestNotes` callback -> `VoiceChat` prop -> `ChatInterface` handler -> `useChat.sendMessage`.
- **Programmatic Prompt**: In `ChatInterface.tsx`, the handoff is handled by sending a hidden prompt: *"I am providing the detailed Markdown notes and source links for [Topic] now as requested in our conversation."*
- **Spoken Acknowledgement**: Agent says: *"I've put those details in the chat for you"* followed by a verbal highlight summary.

---

## Technical Considerations

### Audio Pipeline
- **Public Assets**: `public/audio-processor.js` is **required**. It handles the PCM conversion in an `AudioWorklet`.
- **Sample Rate**: All components (Mic capture, AudioContext, Deepgram Settings) must be synchronized at **24,000 Hz**.
- **Echo Cancellation**: Enabled by default in `getUserMedia` constraints to prevent feedback loops.

### State Management
- **AgentState**: The system tracks `idle`, `connecting`, `listening`, `thinking`, and `speaking`.
- **Persona Sync**: In `VoiceChat.tsx`, `AgentState` is mapped to `PersonaState` to trigger the appropriate AI animations (e.g., `thinking` state triggers the "pulsing" animation).

### Security & Persistence
- **Token Exchange**: The `/api/voice-token` route provides short-lived temporary credentials to the browser, preventing the exposure of the master `DEEPGRAM_API_KEY`.
- **Chat History Persistence**: Chat messages are saved to `localStorage` only when a stream finishes, ensuring reliability while avoiding unnecessary writes during token-by-token generation.
- **Client-Side Rendering**: Voice components and chat history utilize `useEffect` to ensure they only initialize on the client, preventing SSR hydration mismatches.

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

## API Routes

| Route | Purpose |
|-------|---------|
| `POST /api/chat` | Main chat endpoint with AI SDK streaming |
| `POST /api/crawl` | Trigger domain crawl (admin only) |
| `GET /api/domains` | List crawled domains (admin only) |
| `GET /api/faqs` | Get approved FAQs |
| `GET /api/settings` | Get onboarding settings |
| `POST /api/settings` | Update settings (admin only) |
| `POST /api/onboarding/complete` | Mark onboarding complete |
| `POST /api/onboarding/crawl` | Start initial crawl |
| `GET /api/onboarding/status` | Check onboarding status |
| `POST /api/onboarding/detect` | Auto-detect university info from URL |
| `GET /api/startup` | App initialization check |
| `POST /api/voice-token` | Get temporary Deepgram credentials |
| `POST /api/voice-function` | Voice agent function calls |
| `POST /api/upload` | File upload handling |
| `POST /api/uploadthing` | UploadThing integration |
| `GET /api/media/[filename]` | Serve uploaded media files |
| `GET /api/threads` | List chat threads |

---

## Admin Authentication

Admin routes are protected by middleware:

1. **Cookie-based**: Checks `admin_token` cookie
2. **Header-based**: Checks `Authorization: Bearer <token>` header
3. **Token must match** `ADMIN_SECRET` env var (min 16 characters)

Protected routes: `/admin/*`, `/api/crawl/*`, `/api/domains/*`, `/api/settings` (POST)

---

## Package Overrides

Required in `.env.local`:

```
# Required for core functionality
MONGODB_URI=mongodb+srv://...
CHAT_API_KEY=...              # LLM API key (Cerebras, OpenAI-compatible)
TAVILY_API_KEY=...            # For web crawling
EMBEDDING_API_KEY=...         # Voyage AI key
ADMIN_SECRET=...              # Min 16 chars, for admin dashboard access

# Chat model configuration
CHAT_MODEL=gpt-oss-120b       # Default model
CHAT_BASE_URL=...             # Optional, for non-OpenAI providers
CHAT_MAX_TOKENS=32000         # Max response tokens
CHAT_MAX_STEPS=5              # Max tool calls per request

# Embedding configuration
EMBEDDING_MODEL=voyage-4-large
EMBEDDING_DIMENSIONS=2048

# Crawl configuration
CRAWL_MAX_DEPTH=2
CRAWL_MAX_BREADTH=20
CRAWL_LIMIT=100
CRAWL_EXTRACT_DEPTH=advanced  # 'basic' or 'advanced'
CRAWL_EXCLUDE_PATHS=/archive/*,/admin/*,/login/*

# Voice (optional)
DEEPGRAM_API_KEY=...
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_TTS_MODEL=aura-2-thalia-en

# File uploads (optional)
UPLOADTHING_SECRET=...
UPLOADTHING_APP_ID=...

# Database collections (defaults shown)
DB_NAME=edurag
VECTOR_COLLECTION=crawled_index
FAQ_COLLECTION=faqs
FAQ_THRESHOLD=5               # Questions before auto-synthesis
```

---

## Onboarding Flow

The app has a setup wizard for first-time configuration:

1. **Middleware checks** `edurag_onboarded` cookie and required env vars
2. **Redirects to `/setup`** if not onboarded and missing env vars
3. **Settings stored** in MongoDB `settings` collection with `_id: 'onboarding'`
4. **Brand customization**: appName, brandPrimary, brandSecondary, brandLogoUrl, emoji, iconType
5. **Crawl config**: maxDepth, maxBreadth, limit, excludePaths
6. **File type rules**: pdf/docx/csv can be set to 'index' or 'skip'

---

## MongoDB Collections

| Collection | Purpose |
|------------|---------|
| `crawled_index` | Vector search documents with embeddings |
| `settings` | Onboarding config (single doc, `_id: 'onboarding'`) |
| `faqs` | Auto-generated FAQs with approval workflow |
| `domains` | Crawled domain configurations |
| `checkpoints_aio` | LangGraph checkpoint storage |
| `checkpoint_writes_aio` | LangGraph checkpoint writes |

---

## FAQ System

Questions are automatically tracked and synthesized:

1. **Tracking**: Each user question is normalized and counted in `faqs` collection
2. **Threshold**: When `count >= FAQ_THRESHOLD`, an answer is auto-generated
3. **Approval**: Admin reviews and approves/rejects in `/admin/faqs`
4. **Display**: Approved FAQs shown on landing page and used by `getPopularFaqs` tool

---

## Package Overrides

The `package.json` includes an `overrides` section to resolve npm peer dependency conflicts:

```json
"overrides": {
  "zod": "^4.3.6"
}
```

This forces all packages to use zod v4, which is required by AI SDK 6 but not yet supported by `@langchain/community`. The `.npmrc` file with `legacy-peer-deps=true` handles any remaining conflicts during Vercel deployment.

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
