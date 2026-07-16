import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// A 32-byte key is what AES-256-GCM requires. Accept base64 or hex so operators
// can paste the output of either `openssl rand -base64 32` or `openssl rand -hex 32`.
const decodeKey = (raw: string): Buffer | null => {
  for (const encoding of ['base64', 'hex'] as const) {
    const buf = Buffer.from(raw, encoding);
    if (buf.length === 32) return buf;
  }
  return null;
};

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().default('3001'),
  WEB_URL: z.string().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  LLM_MODEL_STANDARD: z.string().default('meta-llama/llama-3.1-8b-instruct'),
  LLM_MODEL_CONTENT: z.string().default('meta-llama/llama-3.1-8b-instruct'),
  LLM_MODEL_FALLBACK: z.string().default('google/gemma-2-9b-it:free'),
  EMBEDDING_MODEL: z.string().default('openai/text-embedding-3-small'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Falls back to JWT_SECRET when unset/empty (token_type claim keeps the two token kinds
  // non-interchangeable either way), so existing .env files keep booting.
  JWT_REFRESH_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters').optional(),
  ),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  CREDENTIAL_ENCRYPTION_KEY: z
    .string()
    .refine((v) => decodeKey(v) !== null, 'CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (openssl rand -base64 32)'),

  // Optional on purpose — if unset, the startup seed simply skips (see lib/seedSuperAdmin.ts).
  SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL must be a valid email').optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters').optional(),
  SUPER_ADMIN_NAME: z.string().optional(),

  // Platform values are all optional on purpose: a developer without LinkedIn
  // approval (or without Mursalin's tokens yet) must still be able to boot.
  OAUTH_REDIRECT_BASE_URL: z.string().default('http://localhost:3001/api/v1'),

  FB_CLIENT_ID: z.string().optional(),
  FB_CLIENT_SECRET: z.string().optional(),
  FB_PAGE_TOKEN: z.string().optional(),
  FB_PAGE_ID: z.string().optional(),

  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_API_KEY: z.string().optional(),
  YOUTUBE_CHANNEL_ID: z.string().optional(),

  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_TOKEN: z.string().optional(),
  LINKEDIN_ORG_ID: z.string().optional(),

  // News ingestion pipeline — all optional so the server boots fine before an operator
  // has configured RSS feeds or tuned the scoring thresholds.
  NEWS_INGESTION_RSS_FEEDS: z.string().optional(),
  NEWS_INGESTION_MAX_AGE_HOURS: z.string().default('72'),
  NEWS_INGESTION_MIN_RELEVANCE: z.string().default('4.0'),
  NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD: z.string().default('0.88'),
  NEWS_INGESTION_CRON: z.string().default('0 */3 * * *'),
  REDDIT_SUBREDDITS: z.string().default('programming,technology,artificial'),
  // Reddit blocks unauthenticated scripted access with HTTP 403 — these are optional so the
  // server boots without them; when unset, the Reddit adapter no-ops instead of throwing.
  REDDIT_CLIENT_ID: z.string().optional(),
  REDDIT_CLIENT_SECRET: z.string().optional(),
  REDDIT_USER_AGENT: z.string().default('web:growth-studio-news:v1.0'),
  // Raises the GitHub Search API's unauthenticated rate limit (10/min, 60/hr) — optional, the
  // adapter works fine without it at this pipeline's call volume.
  GITHUB_TOKEN: z.string().optional(),

  // Analytics & Report
  ANALYTICS_USE_MOCK_ADAPTERS: z.string().default('true'),
  // Comma-separated platform allowlist that goes to REAL adapters when ANALYTICS_USE_MOCK_ADAPTERS
  // is false. Empty (default) => every platform stays mock even with the global switch off.
  ANALYTICS_REAL_PLATFORMS: z.string().default(''),
  // Single upgrade point for the Meta Graph API version — never call unversioned endpoints.
  GRAPH_API_VERSION: z.string().default('v23.0'),
  ANALYTICS_REFRESH_CRON: z.string().default('0 */6 * * *'),
  REPORT_CACHE_TTL_SECONDS: z.string().default('21600'),
  CONTENT_CACHE_TTL_SECONDS: z.string().default('86400'),
  TEAM_EMBEDDINGS_CACHE_TTL_SECONDS: z.string().default('21600'),

  // Auto-generation job
  AUTO_GENERATION_CRON: z.string().default('0 6 * * *'),
  AUTO_GENERATION_MAX_PER_RUN: z.string().default('10'),

  NEWS_INGESTION_CATEGORY_CONFIDENCE_THRESHOLD: z.string().default('0.6'),
  NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE: z.string().default('0.4'),
  NEWS_INGESTION_OPPORTUNITY_WEIGHT_TREND: z.string().default('0.3'),
  NEWS_INGESTION_OPPORTUNITY_WEIGHT_FIT: z.string().default('0.3'),
  NEWS_INGESTION_OPPORTUNITY_FALLBACK_RELEVANCE: z.string().default('5.0'),
}).superRefine((data, ctx) => {
  const weightSum =
    Number(data.NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE) +
    Number(data.NEWS_INGESTION_OPPORTUNITY_WEIGHT_TREND) +
    Number(data.NEWS_INGESTION_OPPORTUNITY_WEIGHT_FIT);
  if (Math.abs(weightSum - 1) > 0.001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE'],
      message: `NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE + _TREND + _FIT must sum to 1 (got ${weightSum})`,
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsed.data;

export const credentialEncryptionKey = decodeKey(env.CREDENTIAL_ENCRYPTION_KEY) as Buffer;

export default {
  node_env: env.NODE_ENV,
  port: env.PORT,
  web_url: env.WEB_URL,

  database_url: env.DATABASE_URL,
  redis_url: env.REDIS_URL,

  openrouter_api_key: env.OPENROUTER_API_KEY,
  llm_model_standard: env.LLM_MODEL_STANDARD,
  llm_model_content: env.LLM_MODEL_CONTENT,
  llm_model_fallback: env.LLM_MODEL_FALLBACK,

  embedding_model: env.EMBEDDING_MODEL,

  jwt_secret: env.JWT_SECRET,
  jwt_expires_in: env.JWT_EXPIRES_IN,
  jwt_refresh_secret: env.JWT_REFRESH_SECRET ?? env.JWT_SECRET,
  jwt_refresh_expires_in: env.JWT_REFRESH_EXPIRES_IN,

  super_admin: {
    email: env.SUPER_ADMIN_EMAIL,
    password: env.SUPER_ADMIN_PASSWORD,
    name: env.SUPER_ADMIN_NAME,
  },

  oauth_redirect_base_url: env.OAUTH_REDIRECT_BASE_URL,

  platforms: {
    facebook: {
      clientId: env.FB_CLIENT_ID,
      clientSecret: env.FB_CLIENT_SECRET,
      bootstrapToken: env.FB_PAGE_TOKEN,
      accountId: env.FB_PAGE_ID,
    },
    youtube: {
      clientId: env.YOUTUBE_CLIENT_ID,
      clientSecret: env.YOUTUBE_CLIENT_SECRET,
      bootstrapToken: env.YOUTUBE_API_KEY,
      accountId: env.YOUTUBE_CHANNEL_ID,
    },
    linkedin: {
      clientId: env.LINKEDIN_CLIENT_ID,
      clientSecret: env.LINKEDIN_CLIENT_SECRET,
      bootstrapToken: env.LINKEDIN_TOKEN,
      accountId: env.LINKEDIN_ORG_ID,
    },
  },

  analytics: {
    use_mock_adapters: env.ANALYTICS_USE_MOCK_ADAPTERS === 'true',
    real_platforms: env.ANALYTICS_REAL_PLATFORMS.split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean),
    graph_api_version: env.GRAPH_API_VERSION,
    refresh_cron: env.ANALYTICS_REFRESH_CRON,
    report_cache_ttl: Number(env.REPORT_CACHE_TTL_SECONDS),
    content_cache_ttl: Number(env.CONTENT_CACHE_TTL_SECONDS),
    team_embeddings_cache_ttl: Number(env.TEAM_EMBEDDINGS_CACHE_TTL_SECONDS),
  },

  auto_generation: {
    cron: env.AUTO_GENERATION_CRON,
    max_per_run: Number(env.AUTO_GENERATION_MAX_PER_RUN),
  },

  news_ingestion: {
    rss_feeds: (env.NEWS_INGESTION_RSS_FEEDS ?? '')
      .split(',')
      .map((url) => url.trim())
      .filter(Boolean),
    max_age_hours: Number(env.NEWS_INGESTION_MAX_AGE_HOURS),
    min_relevance: Number(env.NEWS_INGESTION_MIN_RELEVANCE),
    semantic_dedup_threshold: Number(env.NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD),
    cron: env.NEWS_INGESTION_CRON,
    reddit_subreddits: env.REDDIT_SUBREDDITS.split(',')
      .map((sub) => sub.trim())
      .filter(Boolean),
    reddit: {
      client_id: env.REDDIT_CLIENT_ID,
      client_secret: env.REDDIT_CLIENT_SECRET,
      user_agent: env.REDDIT_USER_AGENT,
    },
    github_token: env.GITHUB_TOKEN,
    category_confidence_threshold: Number(env.NEWS_INGESTION_CATEGORY_CONFIDENCE_THRESHOLD),
    opportunity_weight_relevance: Number(env.NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE),
    opportunity_weight_trend: Number(env.NEWS_INGESTION_OPPORTUNITY_WEIGHT_TREND),
    opportunity_weight_fit: Number(env.NEWS_INGESTION_OPPORTUNITY_WEIGHT_FIT),
    opportunity_fallback_relevance: Number(env.NEWS_INGESTION_OPPORTUNITY_FALLBACK_RELEVANCE),
  },
};
