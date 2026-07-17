"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.credentialEncryptionKey = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
dotenv_1.default.config({ path: path_1.default.join(process.cwd(), '.env') });
// A 32-byte key is what AES-256-GCM requires. Accept base64 or hex so operators
// can paste the output of either `openssl rand -base64 32` or `openssl rand -hex 32`.
const decodeKey = (raw) => {
    for (const encoding of ['base64', 'hex']) {
        const buf = Buffer.from(raw, encoding);
        if (buf.length === 32)
            return buf;
    }
    return null;
};
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.string().default('development'),
    PORT: zod_1.z.string().default('3001'),
    WEB_URL: zod_1.z.string().optional(),
    DATABASE_URL: zod_1.z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: zod_1.z.string().min(1, 'REDIS_URL is required'),
    OPENROUTER_API_KEY: zod_1.z.string().min(1, 'OPENROUTER_API_KEY is required'),
    LLM_MODEL_STANDARD: zod_1.z.string().default('meta-llama/llama-3.1-8b-instruct'),
    LLM_MODEL_CONTENT: zod_1.z.string().default('meta-llama/llama-3.1-8b-instruct'),
    LLM_MODEL_FALLBACK: zod_1.z.string().default('google/gemma-2-9b-it:free'),
    EMBEDDING_MODEL: zod_1.z.string().default('openai/text-embedding-3-small'),
    JWT_SECRET: zod_1.z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRES_IN: zod_1.z.string().default('7d'),
    // Falls back to JWT_SECRET when unset/empty (token_type claim keeps the two token kinds
    // non-interchangeable either way), so existing .env files keep booting.
    JWT_REFRESH_SECRET: zod_1.z.preprocess((v) => (v === '' ? undefined : v), zod_1.z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters').optional()),
    JWT_REFRESH_EXPIRES_IN: zod_1.z.string().default('30d'),
    CREDENTIAL_ENCRYPTION_KEY: zod_1.z
        .string()
        .refine((v) => decodeKey(v) !== null, 'CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes (openssl rand -base64 32)'),
    // Optional on purpose — if unset, the startup seed simply skips (see lib/seedSuperAdmin.ts).
    SUPER_ADMIN_EMAIL: zod_1.z.string().email('SUPER_ADMIN_EMAIL must be a valid email').optional(),
    SUPER_ADMIN_PASSWORD: zod_1.z.string().min(8, 'SUPER_ADMIN_PASSWORD must be at least 8 characters').optional(),
    SUPER_ADMIN_NAME: zod_1.z.string().optional(),
    // Platform values are all optional on purpose: a developer without LinkedIn
    // approval (or without Mursalin's tokens yet) must still be able to boot.
    OAUTH_REDIRECT_BASE_URL: zod_1.z.string().default('http://localhost:3001/api/v1'),
    FB_CLIENT_ID: zod_1.z.string().optional(),
    FB_CLIENT_SECRET: zod_1.z.string().optional(),
    FB_PAGE_TOKEN: zod_1.z.string().optional(),
    FB_PAGE_ID: zod_1.z.string().optional(),
    YOUTUBE_CLIENT_ID: zod_1.z.string().optional(),
    YOUTUBE_CLIENT_SECRET: zod_1.z.string().optional(),
    YOUTUBE_API_KEY: zod_1.z.string().optional(),
    YOUTUBE_CHANNEL_ID: zod_1.z.string().optional(),
    LINKEDIN_CLIENT_ID: zod_1.z.string().optional(),
    LINKEDIN_CLIENT_SECRET: zod_1.z.string().optional(),
    LINKEDIN_TOKEN: zod_1.z.string().optional(),
    LINKEDIN_ORG_ID: zod_1.z.string().optional(),
    // News ingestion pipeline — all optional so the server boots fine before an operator
    // has configured RSS feeds or tuned the scoring thresholds.
    NEWS_INGESTION_RSS_FEEDS: zod_1.z.string().optional(),
    NEWS_INGESTION_MAX_AGE_HOURS: zod_1.z.string().default('72'),
    NEWS_INGESTION_MIN_RELEVANCE: zod_1.z.string().default('4.0'),
    NEWS_INGESTION_SEMANTIC_DEDUP_THRESHOLD: zod_1.z.string().default('0.88'),
    NEWS_INGESTION_CRON: zod_1.z.string().default('0 */3 * * *'),
    REDDIT_SUBREDDITS: zod_1.z.string().default('programming,technology,artificial'),
    // Reddit blocks unauthenticated scripted access with HTTP 403 — these are optional so the
    // server boots without them; when unset, the Reddit adapter no-ops instead of throwing.
    REDDIT_CLIENT_ID: zod_1.z.string().optional(),
    REDDIT_CLIENT_SECRET: zod_1.z.string().optional(),
    REDDIT_USER_AGENT: zod_1.z.string().default('web:growth-studio-news:v1.0'),
    // Raises the GitHub Search API's unauthenticated rate limit (10/min, 60/hr) — optional, the
    // adapter works fine without it at this pipeline's call volume.
    GITHUB_TOKEN: zod_1.z.string().optional(),
    // Comma-separated Mastodon instance hostnames polled for trending links (no auth needed).
    // Default-enabled, unlike credential-gated sources — set to an empty value to disable.
    NEWS_INGESTION_MASTODON_INSTANCES: zod_1.z.string().default('mastodon.social,fosstodon.org'),
    // Product Hunt API v2 OAuth2 client-credentials app. Optional: unset, the adapter
    // logs a warning and reports itself unconfigured instead of hitting the network.
    PRODUCTHUNT_CLIENT_ID: zod_1.z.string().optional(),
    PRODUCTHUNT_CLIENT_SECRET: zod_1.z.string().optional(),
    // Raises the Stack Exchange API's unauthenticated rate limit (300/day -> 10k/day) —
    // optional, the adapter works fine without it at this pipeline's call volume.
    STACKEXCHANGE_KEY: zod_1.z.string().optional(),
    // GNews.io (https://gnews.io) — third-party news-search API, real publisher URLs, no
    // redirect resolution needed. Both optional: unset, the adapter reports itself unconfigured.
    GNEWS_API_KEY: zod_1.z.string().optional(),
    // Comma-separated search topics (at most 3 used per run).
    NEWS_INGESTION_GNEWS_QUERIES: zod_1.z.string().optional(),
    // Analytics & Report
    ANALYTICS_USE_MOCK_ADAPTERS: zod_1.z.string().default('true'),
    // Comma-separated platform allowlist that goes to REAL adapters when ANALYTICS_USE_MOCK_ADAPTERS
    // is false. Empty (default) => every platform stays mock even with the global switch off.
    ANALYTICS_REAL_PLATFORMS: zod_1.z.string().default(''),
    // Single upgrade point for the Meta Graph API version — never call unversioned endpoints.
    GRAPH_API_VERSION: zod_1.z.string().default('v23.0'),
    ANALYTICS_REFRESH_CRON: zod_1.z.string().default('0 */6 * * *'),
    REPORT_CACHE_TTL_SECONDS: zod_1.z.string().default('21600'),
    CONTENT_CACHE_TTL_SECONDS: zod_1.z.string().default('86400'),
    TEAM_EMBEDDINGS_CACHE_TTL_SECONDS: zod_1.z.string().default('21600'),
    // Auto-generation job
    AUTO_GENERATION_CRON: zod_1.z.string().default('0 6 * * *'),
    AUTO_GENERATION_MAX_PER_RUN: zod_1.z.string().default('10'),
    // Engagement refresh job — re-polls stored items' engagement from sources that support cheap
    // per-item re-fetch (hackernews, reddit, devto). All optional so the server boots with none set.
    NEWS_REFRESH_CRON: zod_1.z.string().default('30 * * * *'),
    NEWS_REFRESH_WINDOW_HOURS: zod_1.z.string().default('96'),
    NEWS_REFRESH_MAX_REQUESTS: zod_1.z.string().default('200'),
    // Trend decay scoring — decayed live trend score recomputed at ingest and on every
    // engagement-refresh touch. Both optional so the server boots with neither set.
    NEWS_TREND_DECAY_TAU_HOURS: zod_1.z.string().default('36'),
    NEWS_TREND_VELOCITY_BONUS: zod_1.z.string().default('2'),
    // Dedup tombstone ledger — how long a deleted item's content_hash keeps blocking
    // re-ingestion of the same URL. Optional so the server boots with it unset.
    NEWS_DEDUP_LEDGER_TTL_DAYS: zod_1.z.string().default('30'),
    // News retention lifecycle — archive (reversible) then hard-delete (after cooling-off) old or
    // out-of-trend items. All optional so the server boots with none of these set.
    NEWS_RETENTION_CRON: zod_1.z.string().default('15 */6 * * *'),
    NEWS_ARCHIVE_MAX_AGE_HOURS: zod_1.z.string().default('96'),
    NEWS_ARCHIVE_MIN_AGE_HOURS: zod_1.z.string().default('36'),
    NEWS_ARCHIVE_TREND_FLOOR: zod_1.z.string().default('2.0'),
    NEWS_DELETE_AFTER_DAYS: zod_1.z.string().default('14'),
    NEWS_INGESTION_CATEGORY_CONFIDENCE_THRESHOLD: zod_1.z.string().default('0.6'),
    NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE: zod_1.z.string().default('0.4'),
    NEWS_INGESTION_OPPORTUNITY_WEIGHT_TREND: zod_1.z.string().default('0.3'),
    NEWS_INGESTION_OPPORTUNITY_WEIGHT_FIT: zod_1.z.string().default('0.3'),
    NEWS_INGESTION_OPPORTUNITY_FALLBACK_RELEVANCE: zod_1.z.string().default('5.0'),
}).superRefine((data, ctx) => {
    const weightSum = Number(data.NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE) +
        Number(data.NEWS_INGESTION_OPPORTUNITY_WEIGHT_TREND) +
        Number(data.NEWS_INGESTION_OPPORTUNITY_WEIGHT_FIT);
    if (Math.abs(weightSum - 1) > 0.001) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE'],
            message: `NEWS_INGESTION_OPPORTUNITY_WEIGHT_RELEVANCE + _TREND + _FIT must sum to 1 (got ${weightSum})`,
        });
    }
    const minAgeHours = Number(data.NEWS_ARCHIVE_MIN_AGE_HOURS);
    const maxAgeHours = Number(data.NEWS_ARCHIVE_MAX_AGE_HOURS);
    if (minAgeHours >= maxAgeHours) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['NEWS_ARCHIVE_MIN_AGE_HOURS'],
            message: `NEWS_ARCHIVE_MIN_AGE_HOURS (${minAgeHours}) must be less than NEWS_ARCHIVE_MAX_AGE_HOURS (${maxAgeHours})`,
        });
    }
    const deleteAfterDays = Number(data.NEWS_DELETE_AFTER_DAYS);
    if (deleteAfterDays < 1) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['NEWS_DELETE_AFTER_DAYS'],
            message: `NEWS_DELETE_AFTER_DAYS must be >= 1 (got ${deleteAfterDays})`,
        });
    }
    const trendFloor = Number(data.NEWS_ARCHIVE_TREND_FLOOR);
    if (trendFloor < 0 || trendFloor > 10) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['NEWS_ARCHIVE_TREND_FLOOR'],
            message: `NEWS_ARCHIVE_TREND_FLOOR must be in [0, 10] (got ${trendFloor})`,
        });
    }
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
}
const env = parsed.data;
exports.credentialEncryptionKey = decodeKey(env.CREDENTIAL_ENCRYPTION_KEY);
exports.default = {
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
    jwt_refresh_secret: (_a = env.JWT_REFRESH_SECRET) !== null && _a !== void 0 ? _a : env.JWT_SECRET,
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
        rss_feeds: ((_b = env.NEWS_INGESTION_RSS_FEEDS) !== null && _b !== void 0 ? _b : '')
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
        mastodon_instances: env.NEWS_INGESTION_MASTODON_INSTANCES.split(',')
            .map((instance) => instance.trim())
            .filter(Boolean),
        producthunt: {
            client_id: env.PRODUCTHUNT_CLIENT_ID,
            client_secret: env.PRODUCTHUNT_CLIENT_SECRET,
        },
        stackexchange_key: env.STACKEXCHANGE_KEY,
        gnews: {
            api_key: env.GNEWS_API_KEY,
            queries: ((_c = env.NEWS_INGESTION_GNEWS_QUERIES) !== null && _c !== void 0 ? _c : '')
                .split(',')
                .map((topic) => topic.trim())
                .filter(Boolean),
        },
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
