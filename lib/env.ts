import { z } from 'zod';

const envSchema = z.object({
  CHAT_API_KEY: z.string().min(1),
  CHAT_BASE_URL: z.string().url(),
  CHAT_MODEL: z.string(),
  CHAT_MAX_TOKENS: z.coerce.number().default(32000),
  CHAT_CONTEXT_LENGTH: z.coerce.number().default(65536),

  EMBEDDING_API_KEY: z.string().min(1),
  EMBEDDING_BASE_URL: z.string().url(),
  EMBEDDING_MODEL: z.string(),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(2048),

  MONGODB_URI: z.string().min(1),
  DB_NAME: z.string().default('edurag'),
  COLLECTION1: z.string().default('crawled_index'),
  COLLECTION2: z.string().default('checkpoints_aio'),
  COLLECTION3: z.string().default('checkpoint_writes_aio'),
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
