/**
 * OpenAPI component schemas for each REST resource.
 *
 * Kept in sync with:
 *  - Zod validators (`*.validation.ts`) for request-body required/optional fields
 *  - Mongoose interfaces (`*.interface.ts`) / models for persisted document shape
 *
 * The `*` schemas describe the full persisted document (response shape); the
 * `*Create` and `*Update` schemas describe request bodies.
 */

const engagement = {
  type: 'object',
  properties: {
    points: { type: 'number', default: 0 },
    comments: { type: 'number', default: 0 },
    stars_delta: { type: 'number', default: 0 },
  },
} as const;

const embedding = {
  type: 'array',
  items: { type: 'number' },
  minItems: 1536,
  maxItems: 1536,
  description: '1536-dimension vector (openai/text-embedding-3-small).',
} as const;

export const NewsItem = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    source: { type: 'string' },
    source_id: { type: 'string' },
    content_hash: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string', format: 'uri', description: 'The resource itself — a link post resolves this to the external site, not the aggregator discussion page.' },
    discussion_url: { type: 'string', format: 'uri', description: 'The aggregator/source discussion page (e.g. the Reddit thread, HN item page, Product Hunt post) when distinct from url.' },
    thumbnail_url: { type: 'string', format: 'uri', description: 'Best-effort resource thumbnail from the source adapter, when available.' },
    snippet: { type: 'string' },
    content: { type: 'string', description: 'Fuller stored text when available (omitted from list responses; see content_status).' },
    content_status: { type: 'string', enum: ['none', 'partial', 'full', 'failed'], default: 'none' },
    word_count: { type: 'number' },
    content_fetched_at: { type: 'string', format: 'date-time' },
    published_at: { type: 'string', format: 'date-time' },
    engagement,
    trend_score: { type: 'number', default: 0 },
    category: { type: 'string', description: 'Any name in the global category taxonomy (fixed six or discovered during ingestion) — not restricted to a fixed enum.' },
    category_group: { type: 'string', description: 'The one of the fixed six categories (AI/Web Dev/Career/Security/DevOps/Other) this item\'s category rolls up under.' },
    relevance_score: { type: 'number' },
    impact_note: { type: 'string' },
    embedding,
    opportunity_score: { type: 'number' },
    processed: { type: 'boolean', default: false },
    category_confidence: { type: 'number', description: 'Confidence (0-1) of the auto-assigned category, from ingestion.' },
    needs_review: { type: 'boolean', description: 'True when category_confidence fell below the review threshold at ingestion time.' },
    is_overridden: {
      type: 'boolean',
      description: "True when the requesting user's team has a category/opportunity_score override on this item (see the override endpoints). Only ever computed on authenticated requests; category/opportunity_score above already reflect the override when true.",
    },
    match_reason: {
      type: 'string',
      enum: ['semantic'],
      description: 'Present only on GET /news-items list responses, only on items surfaced by the optional semantic "nearly relevant" tier (off by default) rather than an exact/broad-group category match — see flexible-news-taxonomy-and-relevance.',
    },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['source', 'source_id', 'content_hash', 'title', 'url'],
} as const;

export const NewsItemCreate = {
  type: 'object',
  properties: {
    source: { type: 'string' },
    source_id: { type: 'string' },
    content_hash: { type: 'string' },
    title: { type: 'string' },
    url: { type: 'string', format: 'uri' },
    snippet: { type: 'string' },
    content: { type: 'string' },
    content_status: { type: 'string', enum: ['none', 'partial', 'full', 'failed'] },
    word_count: { type: 'number' },
    published_at: { type: 'string', format: 'date-time' },
    engagement,
    category: { type: 'string' },
    embedding,
  },
  required: ['source', 'source_id', 'content_hash', 'title', 'url'],
} as const;

export const NewsItemUpdate = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    url: { type: 'string', format: 'uri' },
    snippet: { type: 'string' },
    content: { type: 'string' },
    content_status: { type: 'string', enum: ['none', 'partial', 'full', 'failed'] },
    word_count: { type: 'number' },
    published_at: { type: 'string', format: 'date-time' },
    engagement,
    trend_score: { type: 'number' },
    category: { type: 'string' },
    relevance_score: { type: 'number' },
    impact_note: { type: 'string' },
    opportunity_score: { type: 'number' },
    processed: { type: 'boolean' },
  },
} as const;

export const BrandVoiceExample = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    platform: { type: 'string' },
    category: { type: 'string' },
    content: { type: 'string' },
    embedding,
    engagement_hint: { type: 'string' },
    added_by: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['team_id', 'platform', 'content'],
} as const;

export const BrandVoiceExampleCreate = {
  type: 'object',
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    platform: { type: 'string' },
    category: { type: 'string' },
    content: { type: 'string' },
    engagement_hint: { type: 'string' },
    added_by: { type: 'string' },
    embedding,
  },
  required: ['team_id', 'platform', 'content'],
} as const;

export const User = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    role: { type: 'string', enum: ['super_admin', 'admin', 'user'] },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['email', 'name', 'role'],
} as const;

export const UserCreate = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8 },
    name: { type: 'string' },
    role: { type: 'string', enum: ['super_admin', 'admin', 'user'], default: 'user' },
    team_ids: { type: 'array', items: { type: 'string' } },
  },
  description: 'Only an existing super_admin may create/promote another super_admin.',
  required: ['email', 'password', 'name'],
} as const;

export const LoginRequest = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string' },
  },
  required: ['email', 'password'],
} as const;

export const Team = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    name: { type: 'string' },
    description: { type: 'string' },
    created_by: { type: 'string' },
    custom_categories: {
      type: 'array',
      items: { type: 'string' },
      description: "Team-added categories layered on top of the built-in defaults (AI, Web Dev, Career, Security, DevOps, Other). Max 20.",
    },
    subscribed_categories: {
      type: 'array',
      items: { type: 'string' },
      description: "Subset of the fixed news taxonomy (AI, Web Dev, Career, Security, DevOps, Other) the team's feed and auto-generation job are filtered to. Empty means all categories.",
    },
    default_style_pack_id: {
      type: 'string',
      nullable: true,
      description: 'Optional reference to a globally-curated StylePack this team writes in by default. A dangling or inactive reference never breaks team operations.',
    },
    default_models: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Per-task LlmModel id override (task name -> LlmModel._id), the 2nd of 4 tiers resolveModelForTask checks. A dangling/inactive/wrong-capability reference never breaks team operations — it soft-falls through to the next tier. Defaults to {}.',
    },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['name', 'created_by'],
} as const;

export const TeamCreate = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    member_ids: { type: 'array', items: { type: 'string' } },
  },
  required: ['name'],
} as const;

export const BrandVoiceExampleUpdate = {
  type: 'object',
  properties: {
    platform: { type: 'string' },
    category: { type: 'string' },
    content: { type: 'string' },
    engagement_hint: { type: 'string' },
    added_by: { type: 'string' },
  },
} as const;

export const GenerateContentRequest = {
  type: 'object',
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    topic: { type: 'string', example: 'React 19 Released — Server Components Are Now Stable' },
    news_item_id: {
      type: 'string',
      example: '507f1f77bcf86cd799439011',
      description: 'Optional. When provided and resolvable, its embedding and category/impact_note ground the generation instead of re-embedding the topic text.',
    },
    language: {
      type: 'string',
      enum: ['bangla', 'english', 'banglish'],
      description: "Optional per-request override of the team's default_language.",
    },
    style_pack_id: {
      type: 'string',
      example: '507f1f77bcf86cd799439011',
      description: "Optional per-request override of the team's default_style_pack_id.",
    },
    formats: {
      type: 'array',
      items: { type: 'string', enum: ['facebook_post', 'linkedin_post', 'facebook_reel_script', 'youtube_idea', 'caption'] },
      description: 'Non-empty, unique, at most 5 formats to generate — each is its own LLM call. Defaults to ["facebook_post", "linkedin_post"].',
    },
    regenerate: {
      type: 'boolean',
      description: 'Deprecated — no longer has any effect. Every request always produces a fresh draft for each requested format; the field is accepted-and-ignored so an older client is not rejected.',
    },
    llm_model_id: {
      type: 'string',
      example: '507f1f77bcf86cd799439011',
      description: "Optional per-request override of the resolved content_generation model — an LlmModel _id. Highest-priority tier of resolveModelForTask.",
    },
  },
  required: ['team_id', 'topic'],
} as const;

export const RefineContentRequest = {
  type: 'object',
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    format: {
      type: 'string',
      enum: ['facebook_post', 'linkedin_post', 'facebook_reel_script', 'caption'],
      description: 'Text formats only — youtube_idea is a structured object and is not supported by refine.',
    },
    current_text: { type: 'string', minLength: 1, maxLength: 6000, description: 'The draft text to edit.' },
    instruction: { type: 'string', minLength: 1, maxLength: 300, example: 'Make it shorter' },
    language: { type: 'string', enum: ['bangla', 'english', 'banglish'] },
    style_pack_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    llm_model_id: {
      type: 'string',
      example: '507f1f77bcf86cd799439011',
      description: "Optional per-request override of the resolved content_generation model — an LlmModel _id.",
    },
  },
  required: ['team_id', 'format', 'current_text', 'instruction'],
} as const;

export const RefineContentResponse = {
  type: 'object',
  properties: {
    revised_text: { type: 'string' },
  },
  required: ['revised_text'],
} as const;

export const CreateDraftRequest = {
  type: 'object',
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    news_item_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    topic: { type: 'string', minLength: 1, maxLength: 300 },
    formats: {
      type: 'object',
      description: 'Any non-empty subset — at least one format must be populated.',
      properties: {
        facebook_post: { type: 'string' },
        facebook_reel_script: { type: 'string' },
        linkedin_post: { type: 'string' },
        youtube_idea: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            hook: { type: 'string' },
            chapters: { type: 'array', items: { type: 'string' } },
            thumbnail_concept: { type: 'string' },
          },
        },
        caption: { type: 'string' },
      },
    },
    model_used: { type: 'string' },
  },
  required: ['team_id', 'topic', 'formats'],
} as const;

export const GeneratedContent = {
  type: 'object',
  description: 'Only the requested formats are populated in the response, alongside topic.',
  properties: {
    topic: { type: 'string' },
    facebook_post: { type: 'string' },
    facebook_reel_script: { type: 'string' },
    linkedin_post: { type: 'string' },
    youtube_idea: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        hook: { type: 'string' },
        chapters: { type: 'array', items: { type: 'string' } },
        thumbnail_concept: { type: 'string' },
      },
      required: ['title', 'hook', 'chapters', 'thumbnail_concept'],
    },
    caption: { type: 'string' },
    model_used: {
      type: 'string',
      description: 'The literal model id resolveModelForTask resolved for content_generation on this request. Always present — every request generates fresh output for every requested format, so model resolution always runs.',
    },
  },
  required: ['topic', 'model_used'],
} as const;

export const AskChatRequest = {
  type: 'object',
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    message: { type: 'string', example: 'এই সপ্তাহে AI নিয়ে কোন news আছে?' },
    conversation_id: {
      type: 'string',
      description: 'Omit to start a new conversation; pass back the value from a prior response to continue it.',
      example: 'b3a1e0f0-...-uuid',
    },
  },
  required: ['team_id', 'message'],
} as const;

export const AskChatResponse = {
  type: 'object',
  properties: {
    conversation_id: { type: 'string' },
    reply: { type: 'string' },
  },
  required: ['conversation_id', 'reply'],
} as const;

export const SourceSummary = {
  type: 'object',
  properties: {
    source: { type: 'string', example: 'hackernews' },
    fetched: { type: 'integer', description: 'Raw items returned by this source adapter.' },
    deduped: { type: 'integer', description: 'Items dropped as stale or duplicates of already-stored items.' },
    discarded: { type: 'integer', description: 'Items dropped for staleness, dedupe, or falling below the relevance threshold.' },
    stored: { type: 'integer', description: 'Items from this source that survived scoring and were attempted for storage.' },
  },
  required: ['source', 'fetched', 'deduped', 'discarded', 'stored'],
} as const;

export const IngestionSummary = {
  type: 'object',
  description: 'Result of one run of the 4-layer news ingestion pipeline (fetch/normalize → dedupe/freshness → relevance/trend scoring → categorize/opportunity scoring).',
  properties: {
    sources: { type: 'array', items: { $ref: '#/components/schemas/SourceSummary' } },
    totalStored: { type: 'integer', description: 'Total news items newly inserted across all sources in this run.' },
  },
  required: ['sources', 'totalStored'],
} as const;

export const SetNewsItemOverrideRequest = {
  type: 'object',
  description: "Lets a team correct the auto-assigned category and/or opportunity_score for a news item without mutating the shared/global document other teams see. At least one of category or opportunity_score is required; category must be one of the team's effective categories (see GET /teams/{teamId}/categories).",
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    category: { type: 'string', example: 'AI' },
    opportunity_score: { type: 'number', minimum: 0, maximum: 10 },
  },
  required: ['team_id'],
} as const;

export const ClearNewsItemOverrideRequest = {
  type: 'object',
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
  },
  required: ['team_id'],
} as const;

export const NewsItemCategoryOverride = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    news_item_id: { type: 'string' },
    team_id: { type: 'string' },
    category: { type: 'string' },
    opportunity_score: { type: 'number' },
    overridden_by: { type: 'string' },
    overridden_at: { type: 'string', format: 'date-time' },
  },
  required: ['news_item_id', 'team_id', 'overridden_by', 'overridden_at'],
} as const;

export const AddCategoryRequest = {
  type: 'object',
  properties: {
    category: { type: 'string', minLength: 1, maxLength: 40, example: 'product-announcement' },
  },
  required: ['category'],
} as const;

export const StylePack = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    name: { type: 'string', example: 'Programming Hero' },
    slug: { type: 'string', example: 'programming-hero' },
    description: { type: 'string' },
    language: { type: 'string', enum: ['bangla', 'english', 'banglish'] },
    tone_tags: { type: 'array', items: { type: 'string' } },
    style_card: { type: 'string', description: 'Freeform ~300-word description of tone, rhythm, and habits, curated or LLM-generated.' },
    style_card_generated_at: { type: 'string', format: 'date-time', description: 'When style_card was last (re)generated via the CLI script or POST /:id/generate-card.' },
    style_card_example_count: { type: 'integer', description: 'Example count at the time style_card was generated — compare against example_count to derive staleness.' },
    is_active: { type: 'boolean' },
    created_by: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    example_count: { type: 'integer', description: 'Only present on the single-pack detail read.' },
  },
  required: ['name', 'slug', 'language', 'is_active', 'created_by'],
} as const;

export const StylePackCreate = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
    description: { type: 'string' },
    language: { type: 'string', enum: ['bangla', 'english', 'banglish'] },
    tone_tags: { type: 'array', items: { type: 'string' } },
    style_card: { type: 'string' },
    is_active: { type: 'boolean' },
  },
  required: ['name', 'slug', 'language'],
} as const;

export const StyleExample = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    style_pack_id: { type: 'string' },
    content: { type: 'string' },
    embedding,
    platform: { type: 'string', enum: ['facebook', 'linkedin', 'other'] },
    source_ref: { type: 'string' },
    engagement_hint: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['style_pack_id', 'content', 'embedding'],
} as const;

export const StyleExampleCreate = {
  type: 'object',
  properties: {
    content: { type: 'string', minLength: 1, maxLength: 8000 },
    platform: { type: 'string', enum: ['facebook', 'linkedin', 'other'] },
    source_ref: { type: 'string' },
    engagement_hint: { type: 'string' },
  },
  required: ['content'],
} as const;

export const StyleExampleBulkCreate = {
  type: 'object',
  properties: {
    items: { type: 'array', items: { $ref: '#/components/schemas/StyleExampleCreate' }, minItems: 1, maxItems: 100 },
  },
  required: ['items'],
} as const;

export const StyleExampleBulkResult = {
  type: 'object',
  properties: {
    created: { type: 'integer', description: 'Examples embedded and stored.' },
    skipped: { type: 'integer', description: 'Items skipped as whitespace-normalized duplicates, either against existing examples or earlier items in the same batch.' },
    total: { type: 'integer', description: "The pack's total example count after this import." },
  },
  required: ['created', 'skipped', 'total'],
} as const;

export const StyleCardGenerateResult = {
  type: 'object',
  properties: {
    style_card: { type: 'string' },
  },
  required: ['style_card'],
} as const;

export const LlmProviderKey = {
  type: 'object',
  description: 'Masked by default — encrypted_key never appears in a response. See POST .../reveal for the real value.',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    key_last4: { type: 'string', example: '1234' },
    label: { type: 'string', example: 'primary' },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['_id', 'key_last4', 'is_active'],
} as const;

export const LlmProvider = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    provider_type: { type: 'string', enum: ['openrouter', 'anthropic', 'openai'] },
    name: { type: 'string', example: 'OpenRouter (primary)' },
    keys: { type: 'array', items: { $ref: '#/components/schemas/LlmProviderKey' } },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['provider_type', 'name'],
} as const;

export const LlmProviderCreate = {
  type: 'object',
  properties: {
    provider_type: { type: 'string', enum: ['openrouter', 'anthropic', 'openai'] },
    name: { type: 'string' },
    is_active: { type: 'boolean' },
  },
  required: ['provider_type', 'name'],
} as const;

export const LlmProviderAddKey = {
  type: 'object',
  properties: {
    key: { type: 'string', description: 'Plaintext API key — encrypted at rest, never echoed back beyond key_last4.' },
    label: { type: 'string', example: 'primary' },
  },
  required: ['key'],
} as const;

export const LlmProviderKeyReveal = {
  type: 'object',
  properties: {
    key_id: { type: 'string' },
    key: { type: 'string', description: 'The decrypted, plaintext API key.' },
  },
  required: ['key_id', 'key'],
} as const;

export const LlmModel = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    provider_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    model_id: { type: 'string', example: 'anthropic/claude-3-5-sonnet' },
    display_name: { type: 'string', example: 'Claude 3.5 Sonnet' },
    capabilities: { type: 'array', items: { type: 'string', enum: ['chat', 'embedding'] } },
    is_active: { type: 'boolean', default: true },
    created_at: { type: 'string', format: 'date-time' },
  },
  required: ['provider_id', 'model_id', 'display_name', 'capabilities'],
} as const;

export const LlmModelCreate = {
  type: 'object',
  properties: {
    model_id: { type: 'string' },
    display_name: { type: 'string' },
    capabilities: { type: 'array', items: { type: 'string', enum: ['chat', 'embedding'] }, minItems: 1 },
    is_active: { type: 'boolean' },
  },
  required: ['model_id', 'display_name', 'capabilities'],
} as const;

const LLM_TASK_ENUM = [
  'content_generation',
  'chat',
  'categorization',
  'dedup_adjudication',
  'style_card',
  'critique',
  'fact_extraction',
  'embedding',
];

export const LlmTaskDefault = {
  type: 'object',
  description: 'A super-admin-set global default LlmModel for one named task — the 3rd of 4 tiers resolveModelForTask checks (request > team > global > bootstrap).',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    task: { type: 'string', enum: LLM_TASK_ENUM },
    llm_model_id: { oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/LlmModel' }], description: 'Populated with the full LlmModel on read.' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['task', 'llm_model_id'],
} as const;

export const LlmTaskDefaultSet = {
  type: 'object',
  properties: {
    llm_model_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
  },
  required: ['llm_model_id'],
} as const;

export const LlmModelActive = {
  type: 'object',
  description: 'Flat, active/chat-capable-only projection across every active provider — what the Generate page model picker consumes. Any authenticated user may read this (not super-admin-only).',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    model_id: { type: 'string', example: 'anthropic/claude-3-5-sonnet' },
    display_name: { type: 'string', example: 'Claude 3.5 Sonnet' },
    provider_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    provider_type: { type: 'string', enum: ['openrouter', 'anthropic', 'openai'] },
    provider_name: { type: 'string', example: 'Anthropic (primary)' },
  },
  required: ['_id', 'model_id', 'display_name', 'provider_id'],
} as const;
