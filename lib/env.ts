import { z } from 'zod';

const envSchema = z.object({
  CHAT_API_KEY: z.string().min(1).optional(),
  CHAT_BASE_URL: z.string().url().optional().or(z.literal('')),
  CHAT_MODEL: z.string().default('gpt-oss-120b'),
  CHAT_MAX_TOKENS: z.coerce.number().default(32000),
  CHAT_MAX_STEPS: z.coerce.number().min(1).max(20).default(5),

  EMBEDDING_API_KEY: z.string().min(1).optional(),
  EMBEDDING_BASE_URL: z.string().url().optional().or(z.literal('')),
  EMBEDDING_MODEL: z.string().default('voyage-4-large'),
  EMBEDDING_DIMENSIONS: z.coerce.number().default(2048),

  MONGODB_URI: z.string().min(1).optional(),
  DB_NAME: z.string().default('edurag'),
  COLLECTION1: z.string().default('crawled_index'),
  COLLECTION2: z.string().default('checkpoints_aio'),
  COLLECTION3: z.string().default('checkpoint_writes_aio'),
  VECTOR_COLLECTION: z.string().default('crawled_index'),
  VECTOR_INDEX_NAME: z.string().default('index'),
  FAQ_COLLECTION: z.string().default('faqs'),
  DOMAINS_COLLECTION: z.string().default('domains'),

  FAQ_THRESHOLD: z.coerce.number().default(5),
  TAVILY_API_KEY: z.string().min(1).optional(),

  CRAWL_MAX_DEPTH: z.coerce.number().min(1).max(5).default(2),
  CRAWL_MAX_BREADTH: z.coerce.number().min(1).max(100).default(20),
  CRAWL_LIMIT: z.coerce.number().default(100),
  CRAWL_EXTRACT_DEPTH: z.enum(['basic', 'advanced']).default('advanced'),
  CRAWL_INSTRUCTIONS: z.string().optional(),
  CRAWL_SELECT_PATHS: z.string().optional(),
  CRAWL_EXCLUDE_PATHS: z.string().optional(),
  CRAWL_ALLOW_EXTERNAL: z.coerce.boolean().default(false),
  CRAWL_FORMAT: z.enum(['markdown', 'text']).default('markdown'),

  ADMIN_SECRET: z.string().min(16).optional(),
  
  UNIVERSITY_URL: z.string().url().optional().or(z.literal('')),
  AUTO_CRAWL: z.coerce.boolean().default(false),
  
  UPLOADTHING_SECRET: z.string().min(1).optional(),
  UPLOADTHING_APP_ID: z.string().min(1).optional(),
  
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

let _env: z.infer<typeof envSchema> | undefined;

export function getEnv(): z.infer<typeof envSchema> {
  if (!_env) {
    _env = envSchema.parse(process.env);
  }
  return _env;
}

export const env = new Proxy({} as z.infer<typeof envSchema>, {
  get(_, prop) {
    return getEnv()[prop as keyof z.infer<typeof envSchema>];
  },
});

export type Env = z.infer<typeof envSchema>;

export function hasRequiredEnvVars(): boolean {
  return !!(
    process.env.MONGODB_URI &&
    process.env.CHAT_API_KEY &&
    process.env.EMBEDDING_API_KEY &&
    process.env.TAVILY_API_KEY &&
    process.env.ADMIN_SECRET
  );
}
