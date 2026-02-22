import { z } from 'zod';

const envSchema = z.object({
  CHAT_API_KEY: z.string().min(1).optional(),
  CHAT_BASE_URL: z.string().url().optional().or(z.literal('')),
  CHAT_MODEL: z.string().default('gpt-oss-120b'),
  CHAT_MAX_TOKENS: z.coerce.number().default(32000),
  CHAT_CONTEXT_LENGTH: z.coerce.number().default(65536),

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
  CONVERSATIONS_COLLECTION: z.string().default('conversations'),
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

  DEEPGRAM_API_KEY: z.string().min(1).optional(),
  VOICE_TTS_API_KEY: z.string().min(1).optional(),
  VOICE_TTS_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  VOICE_TTS_MODEL: z.string().default('tts-1'),
  VOICE_TTS_VOICE: z.string().default('nova'),
  VOICE_ENDPOINTING_MS: z.coerce.number().default(300),
  VOICE_UTTERANCE_END_MS: z.coerce.number().default(1200),
  VOICE_KEEPALIVE_MS: z.coerce.number().default(8000),
  VOICE_ENCOURAGEMENT_MS: z.coerce.number().default(2500),
  VOICE_IDLE_TIMEOUT_MS: z.coerce.number().default(8000),

  ADMIN_SECRET: z.string().min(16).optional(),
  NEXT_PUBLIC_APP_NAME: z.string().default('University Knowledge Base'),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
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
