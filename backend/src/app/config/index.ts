import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { FormatId } from '../modules/ContentGeneration/contentGeneration.formats';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// A 32-byte key is what AES-256-GCM requires. Accept base64 or hex so operators can paste the
// output of either `openssl rand -base64 32` or `openssl rand -hex 32`.
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

  // Legacy/test-only bootstrap tier. Runtime LLM access is configured in-app (super admin →
  // LLM providers: keys stored AES-256-GCM-encrypted in Mongo, models + task defaults picked in
  // the UI — see modelResolution.ts). Leave OPENROUTER_API_KEY unset in real deployments; when
  // unset, resolution that falls through every DB tier throws LlmNotConfiguredError instead of
  // silently using env credentials. `.env.test` still sets these so the mocked Jest suite keeps
  // a deterministic bootstrap path.
  OPENROUTER_API_KEY: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
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

  // Outbound mail (password-reset delivery). All optional: with SMTP_HOST unset the mailer reports
  // itself unconfigured and `forgotPassword` falls back to logging the link, which is exactly the
  // pre-existing behavior — so an existing deployment keeps booting unchanged, it just still can't
  // deliver a reset until these are set. See lib/mailer.ts.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_SECURE: z.string().default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  // Number of reverse-proxy hops in front of this server, for Express's `trust proxy`. This is
  // load-bearing for rate limiting: behind Dokploy with this at 0, every request appears to come
  // from the proxy's address, so one IP-keyed bucket is shared by all users and the auth limiter
  // locks out the whole world at once. Set to 1 in production (Dokploy/Traefik). Left at 0 by
  // default because trusting X-Forwarded-For with no proxy in front lets any client spoof its IP and
  // mint a fresh rate-limit bucket per request.
  TRUST_PROXY_HOPS: z.string().default('0'),

  // Rate limiting. Windows are in minutes, maxes are requests per window.
  // `RATE_LIMIT_ENABLED=false` disables every limiter — the integration suite sets this, since
  // dozens of logins from one address in one test run is the point, not abuse.
  RATE_LIMIT_ENABLED: z.string().default('true'),
  RATE_LIMIT_AUTH_WINDOW_MINUTES: z.string().default('15'),
  RATE_LIMIT_AUTH_MAX: z.string().default('10'),
  RATE_LIMIT_GLOBAL_WINDOW_MINUTES: z.string().default('1'),
  RATE_LIMIT_GLOBAL_MAX: z.string().default('120'),
  // Per-team daily ceiling on LLM-spending endpoints (/content/generate, /content/refine, /chat).
  // This is the limiter that actually protects the provider bill.
  RATE_LIMIT_LLM_WINDOW_MINUTES: z.string().default('1440'),
  RATE_LIMIT_LLM_MAX: z.string().default('200'),

  // Optional on purpose — if unset, the startup seed simply skips (see lib/seedSuperAdmin.ts).
  SUPER_ADMIN_EMAIL: z.string().email('SUPER_ADMIN_EMAIL must be a valid email').optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters').optional(),
  SUPER_ADMIN_NAME: z.string().optional(),

  // News ingestion pipeline — all optional so the server boots fine before an operator
  // has tuned the scoring thresholds.
  NEWS_INGESTION_MAX_AGE_HOURS: z.string().default('72'),
  NEWS_CONTENT_MAX_CHARS: z.string().default('20000'),
  // Kill switch + tuning for the link-page content-enrichment layer (dev.to/GitHub APIs +
  // generic article extraction). Enabled by default — every failure mode there is soft.
  NEWS_CONTENT_FETCH_ENABLED: z.string().default('true'),
  NEWS_CONTENT_FETCH_TIMEOUT_MS: z.string().default('10000'),
  NEWS_CONTENT_FETCH_CONCURRENCY: z.string().default('3'),
  // Floor for "is this item worth a full-content network fetch" — NOT a storage gate (see
  // flexible-news-taxonomy-and-relevance; every deduped item is stored regardless of
  // relevance_score, which is still computed and stored for ranking/opportunity-scoring only).
  // Replaces the old NEWS_INGESTION_MIN_RELEVANCE, which gated storage itself; same 0-10 scale/default.
  NEWS_CONTENT_FETCH_MIN_RELEVANCE: z.string().default('4.0'),
  NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD: z.string().default('0.88'),
  // Two-band dedup (D2): at/above this ceiling a candidate is a hard duplicate dropped without an
  // LLM call; between the semantic threshold and this ceiling it is adjudicated by the LLM judge.
  // Calibrated — re-run the D1 harness (`npm run verify:dedup-calibrate`) before changing.
  NEWS_INGESTION_HARD_DUP_THRESHOLD: z.string().default('0.9443'),
  NEWS_INGESTION_ADJUDICATION_MAX_BATCHES: z.string().default('5'),
  // Ceiling on how many items one run may send to the categorization LLM — the only previously
  // unbounded LLM cost in the pipeline (adjudication has its own cap above). Items over the cap are
  // still STORED, with the same low-confidence fallback a parse failure takes, which sets
  // needs_review; nothing is dropped. Ranked by trend_score, so the cap sheds the coldest items.
  // Sized generously (a normal run stores well under this) — it is a runaway backstop, not a filter.
  NEWS_INGESTION_MAX_CATEGORIZE_ITEMS: z.string().default('400'),
  NEWS_INGESTION_CRON: z.string().default('0 */3 * * *'),
  // Raises the GitHub Search API's unauthenticated rate limit (10/min, 60/hr) — optional, the
  // adapter works fine without it at this pipeline's call volume.
  GITHUB_TOKEN: z.string().optional(),
  // Comma-separated Mastodon instance hostnames polled for trending links (no auth needed).
  // Default-enabled, unlike credential-gated sources — set to an empty value to disable.
  NEWS_INGESTION_MASTODON_INSTANCES: z.string().default('mastodon.social,fosstodon.org'),
  // Product Hunt API v2 OAuth2 client-credentials app. Optional: unset, the adapter
  // logs a warning and reports itself unconfigured instead of hitting the network.
  PRODUCTHUNT_CLIENT_ID: z.string().optional(),
  PRODUCTHUNT_CLIENT_SECRET: z.string().optional(),
  // Raises the Stack Exchange API's unauthenticated rate limit (300/day -> 10k/day) —
  // optional, the adapter works fine without it at this pipeline's call volume.
  STACKEXCHANGE_KEY: z.string().optional(),

  // Auto-generation job
  AUTO_GENERATION_CRON: z.string().default('0 6 * * *'),
  AUTO_GENERATION_MAX_PER_RUN: z.string().default('10'),
  AUTO_GENERATION_MAX_AGE_HOURS: z.string().default('72'),

  // Content generation — facts-then-write fact-sheet extraction
  CONTENT_FACTS_MIN_CHARS: z.string().default('800'),
  CONTENT_FACTS_INPUT_MAX_CHARS: z.string().default('12000'),

  // Content generation — optional critique-and-rewrite second pass. Off by default: enabling this
  // is an evidence-based decision made via `npm run verify:bangla-bakeoff -- --critique both` and
  // recorded in BANGLA-QUALITY-DECISION.md, not a default-on feature. See
  // contentGeneration.critique.ts for the pass itself.
  CONTENT_CRITIQUE_ENABLED: z.string().default('false'),
  CONTENT_CRITIQUE_FORMATS: z.string().default('facebook_post,linkedin_post'),

  // Style packs — optional topic-summary embedding strategy for StyleExample, a ready-but-inactive
  // fallback for Gate G1 (Bangla style-example retrieval quality, unresolved — see
  // 9-VISION-V7-V9-WRITER-STYLE-QUALITY-OPENSPEC-PLAN.md). Off by default; do not enable without a
  // recorded G1 verdict justifying it.
  STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY: z.string().default('false'),

  // News feed — optional semantic "nearly relevant" tier (flexible-news-taxonomy-and-relevance),
  // a ready-but-inactive fallback layered on top of the always-on exact/broad-group category
  // match. Uses Atlas Vector Search ($vectorSearch) against `news_items_vector_index`, which is
  // Atlas-only infrastructure — off by default; do not enable without first confirming that index
  // actually exists on the target deployment's cluster (`npm run db:verify-indexes`), since a
  // missing index would make every semantic-tier lookup fail (harmlessly, per its own try/catch,
  // but pointless until confirmed). Threshold is on $vectorSearch's `vectorSearchScore` meta
  // field's own normalized scale, not raw cosine similarity — tune against real data once enabled.
  NEWS_FEED_SEMANTIC_MATCH_ENABLED: z.string().default('false'),
  NEWS_FEED_SEMANTIC_MATCH_THRESHOLD: z.string().default('0.75'),

  // Engagement refresh job — re-polls stored items' engagement from sources that support cheap
  // per-item re-fetch (hackernews, devto). All optional so the server boots with none set.
  NEWS_REFRESH_CRON: z.string().default('30 * * * *'),
  NEWS_REFRESH_WINDOW_HOURS: z.string().default('96'),
  NEWS_REFRESH_MAX_REQUESTS: z.string().default('200'),

  // Trend decay scoring — decayed live trend score recomputed at ingest and on every
  // engagement-refresh touch. Both optional so the server boots with neither set.
  NEWS_TREND_DECAY_TAU_HOURS: z.string().default('36'),
  NEWS_TREND_VELOCITY_BONUS: z.string().default('2'),

  // Dedup tombstone ledger — how long a deleted item's content_hash keeps blocking
  // re-ingestion of the same URL. Optional so the server boots with it unset.
  NEWS_DEDUP_LEDGER_TTL_DAYS: z.string().default('30'),

  // News retention lifecycle — archive (reversible) then hard-delete (after cooling-off) old or
  // out-of-trend items. All optional so the server boots with none of these set.
  NEWS_RETENTION_CRON: z.string().default('15 */6 * * *'),
  NEWS_ARCHIVE_MAX_AGE_HOURS: z.string().default('96'),
  NEWS_ARCHIVE_MIN_AGE_HOURS: z.string().default('36'),
  NEWS_ARCHIVE_TREND_FLOOR: z.string().default('2.0'),
  NEWS_DELETE_AFTER_DAYS: z.string().default('14'),

  // Chat context retrieval — recency+lifecycle candidate pool for fetchNewsContext, ranked purely
  // by semantic similarity (no trend-score pre-filter). See chat-retrieval-topical-coverage.
  CHAT_CONTEXT_WINDOW_DAYS: z.string().default('7'),
  // Hard cap on candidates fetched from Mongo before in-process cosine ranking — cost control,
  // not a relevance pre-filter (raise if $vectorSearch replaces the in-memory fetch).
  CHAT_CONTEXT_POOL_CAP: z.string().default('500'),
  // Log-only annotation threshold: a top similarity below this is logged so a low-context answer
  // is distinguishable from a model-ignoring-good-context one. Does not gate behavior.
  CHAT_CONTEXT_LOW_RELEVANCE_THRESHOLD: z.string().default('0.3'),

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

  const minAgeHours = Number(data.NEWS_ARCHIVE_MIN_AGE_HOURS);
  const maxAgeHours = Number(data.NEWS_ARCHIVE_MAX_AGE_HOURS);
  if (minAgeHours >= maxAgeHours) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWS_ARCHIVE_MIN_AGE_HOURS'],
      message: `NEWS_ARCHIVE_MIN_AGE_HOURS (${minAgeHours}) must be less than NEWS_ARCHIVE_MAX_AGE_HOURS (${maxAgeHours})`,
    });
  }

  const deleteAfterDays = Number(data.NEWS_DELETE_AFTER_DAYS);
  if (deleteAfterDays < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWS_DELETE_AFTER_DAYS'],
      message: `NEWS_DELETE_AFTER_DAYS must be >= 1 (got ${deleteAfterDays})`,
    });
  }

  const trendFloor = Number(data.NEWS_ARCHIVE_TREND_FLOOR);
  if (trendFloor < 0 || trendFloor > 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWS_ARCHIVE_TREND_FLOOR'],
      message: `NEWS_ARCHIVE_TREND_FLOOR must be in [0, 10] (got ${trendFloor})`,
    });
  }

  const semanticThreshold = Number(data.NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD);
  const hardDupThreshold = Number(data.NEWS_INGESTION_HARD_DUP_THRESHOLD);
  if (!(semanticThreshold > 0 && semanticThreshold <= 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD'],
      message: `NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD must be in (0, 1] (got ${semanticThreshold})`,
    });
  }
  if (!(hardDupThreshold > 0 && hardDupThreshold <= 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWS_INGESTION_HARD_DUP_THRESHOLD'],
      message: `NEWS_INGESTION_HARD_DUP_THRESHOLD must be in (0, 1] (got ${hardDupThreshold})`,
    });
  }
  if (hardDupThreshold <= semanticThreshold) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEWS_INGESTION_HARD_DUP_THRESHOLD'],
      message: `NEWS_INGESTION_HARD_DUP_THRESHOLD (${hardDupThreshold}) must be greater than NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD (${semanticThreshold})`,
    });
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const env = parsed.data;

// Already validated to decode to exactly 32 bytes by the zod refine above — safe to assert non-null here.
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

  mail: {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    // Falls back to SMTP_USER, which is the correct From for most providers anyway.
    from: env.MAIL_FROM ?? env.SMTP_USER,
  },

  trust_proxy_hops: Number(env.TRUST_PROXY_HOPS),

  rate_limit: {
    enabled: env.RATE_LIMIT_ENABLED === 'true',
    auth: {
      window_ms: Number(env.RATE_LIMIT_AUTH_WINDOW_MINUTES) * 60_000,
      max: Number(env.RATE_LIMIT_AUTH_MAX),
    },
    global: {
      window_ms: Number(env.RATE_LIMIT_GLOBAL_WINDOW_MINUTES) * 60_000,
      max: Number(env.RATE_LIMIT_GLOBAL_MAX),
    },
    llm: {
      window_ms: Number(env.RATE_LIMIT_LLM_WINDOW_MINUTES) * 60_000,
      max: Number(env.RATE_LIMIT_LLM_MAX),
    },
  },

  auto_generation: {
    cron: env.AUTO_GENERATION_CRON,
    max_per_run: Number(env.AUTO_GENERATION_MAX_PER_RUN),
    max_age_hours: Number(env.AUTO_GENERATION_MAX_AGE_HOURS),
  },

  content_generation: {
    facts_min_chars: Number(env.CONTENT_FACTS_MIN_CHARS),
    facts_input_max_chars: Number(env.CONTENT_FACTS_INPUT_MAX_CHARS),
    critique_enabled: env.CONTENT_CRITIQUE_ENABLED === 'true',
    critique_formats: env.CONTENT_CRITIQUE_FORMATS.split(',')
      .map((f) => f.trim())
      .filter(Boolean) as FormatId[],
  },

  style_packs: {
    embed_examples_by_topic_summary: env.STYLE_EXAMPLE_EMBED_BY_TOPIC_SUMMARY === 'true',
  },

  news_feed: {
    semantic_match_enabled: env.NEWS_FEED_SEMANTIC_MATCH_ENABLED === 'true',
    semantic_match_threshold: Number(env.NEWS_FEED_SEMANTIC_MATCH_THRESHOLD),
  },

  chat: {
    context_window_days: Number(env.CHAT_CONTEXT_WINDOW_DAYS),
    context_pool_cap: Number(env.CHAT_CONTEXT_POOL_CAP),
    context_low_relevance_threshold: Number(env.CHAT_CONTEXT_LOW_RELEVANCE_THRESHOLD),
  },

  news_ingestion: {
    max_age_hours: Number(env.NEWS_INGESTION_MAX_AGE_HOURS),
    content_max_chars: Number(env.NEWS_CONTENT_MAX_CHARS),
    content_fetch: {
      enabled: env.NEWS_CONTENT_FETCH_ENABLED === 'true',
      timeout_ms: Number(env.NEWS_CONTENT_FETCH_TIMEOUT_MS),
      concurrency: Number(env.NEWS_CONTENT_FETCH_CONCURRENCY),
    },
    content_fetch_min_relevance: Number(env.NEWS_CONTENT_FETCH_MIN_RELEVANCE),
    semantic_dedup_threshold: Number(env.NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD),
    hard_dup_threshold: Number(env.NEWS_INGESTION_HARD_DUP_THRESHOLD),
    adjudication_max_batches: Number(env.NEWS_INGESTION_ADJUDICATION_MAX_BATCHES),
    max_categorize_items: Number(env.NEWS_INGESTION_MAX_CATEGORIZE_ITEMS),
    cron: env.NEWS_INGESTION_CRON,
    github_token: env.GITHUB_TOKEN,
    mastodon_instances: env.NEWS_INGESTION_MASTODON_INSTANCES.split(',')
      .map((instance) => instance.trim())
      .filter(Boolean),
    producthunt: {
      client_id: env.PRODUCTHUNT_CLIENT_ID,
      client_secret: env.PRODUCTHUNT_CLIENT_SECRET,
    },
    stackexchange_key: env.STACKEXCHANGE_KEY,
    category_confidence_threshold: Number(env.NEWS_INGESTION_CATEGORY_CONFIDENCE_THRESHOLD),
    opportunity_weight_relevance: Number(env.NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE),
    opportunity_weight_trend: Number(env.NEWS_INGESTION_OPPORTUNITY_WEIGHT_TREND),
    opportunity_weight_fit: Number(env.NEWS_INGESTION_OPPORTUNITY_WEIGHT_FIT),
    opportunity_fallback_relevance: Number(env.NEWS_INGESTION_OPPORTUNITY_FALLBACK_RELEVANCE),
    refresh: {
      cron: env.NEWS_REFRESH_CRON,
      window_hours: Number(env.NEWS_REFRESH_WINDOW_HOURS),
      max_requests: Number(env.NEWS_REFRESH_MAX_REQUESTS),
    },
    trend_decay: {
      tau_hours: Number(env.NEWS_TREND_DECAY_TAU_HOURS),
      velocity_bonus: Number(env.NEWS_TREND_VELOCITY_BONUS),
    },
    dedup_ledger_ttl_days: Number(env.NEWS_DEDUP_LEDGER_TTL_DAYS),
    retention: {
      cron: env.NEWS_RETENTION_CRON,
      max_age_hours: Number(env.NEWS_ARCHIVE_MAX_AGE_HOURS),
      min_age_hours: Number(env.NEWS_ARCHIVE_MIN_AGE_HOURS),
      trend_floor: Number(env.NEWS_ARCHIVE_TREND_FLOOR),
      delete_after_days: Number(env.NEWS_DELETE_AFTER_DAYS),
    },
  },
};
