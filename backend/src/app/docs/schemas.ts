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
    url: { type: 'string', format: 'uri' },
    snippet: { type: 'string' },
    published_at: { type: 'string', format: 'date-time' },
    engagement,
    trend_score: { type: 'number', default: 0 },
    category: { type: 'string' },
    relevance_score: { type: 'number' },
    impact_note: { type: 'string' },
    embedding,
    opportunity_score: { type: 'number' },
    processed: { type: 'boolean', default: false },
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

const metrics = {
  type: 'object',
  properties: {
    reach: { type: 'number' },
    likes: { type: 'number' },
    comments: { type: 'number' },
    shares: { type: 'number' },
    views: { type: 'number' },
  },
} as const;

export const PlatformPost = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    platform: { type: 'string' },
    post_id: { type: 'string' },
    content_snippet: { type: 'string' },
    embedding,
    metrics,
    published_at: { type: 'string', format: 'date-time' },
    fetched_at: { type: 'string', format: 'date-time' },
  },
  required: ['team_id', 'platform', 'post_id'],
} as const;

export const PlatformPostCreate = {
  type: 'object',
  properties: {
    team_id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    platform: { type: 'string' },
    post_id: { type: 'string' },
    content_snippet: { type: 'string' },
    metrics,
    published_at: { type: 'string', format: 'date-time' },
    embedding,
  },
  required: ['team_id', 'platform', 'post_id'],
} as const;

export const PlatformPostUpdate = {
  type: 'object',
  properties: {
    content_snippet: { type: 'string' },
    metrics,
    published_at: { type: 'string', format: 'date-time' },
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

export const PlatformCredential = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    team_id: { type: 'string' },
    platform: {
      type: 'string',
      example: 'facebook',
      description: 'Any social platform slug, e.g. facebook, youtube, linkedin, reddit, twitter, instagram, tiktok.',
    },
    token_last4: { type: 'string', example: '••••ab12' },
    account_id: { type: 'string' },
    added_by: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  description: 'The real token is never returned here — it is stored encrypted (AES-256-GCM) and only ever decrypted by the explicit reveal endpoint.',
  required: ['team_id', 'platform', 'token_last4'],
} as const;

export const PlatformCredentialCreate = {
  type: 'object',
  properties: {
    platform: {
      type: 'string',
      example: 'facebook',
      description: 'Any social platform slug, e.g. facebook, youtube, linkedin, reddit, twitter, instagram, tiktok.',
    },
    token: { type: 'string', description: 'Plaintext platform token/API key — encrypted at rest, never logged.' },
    account_id: { type: 'string' },
  },
  description: 'The team must have enabled this platform first (see Platform Catalog) — otherwise this is rejected with a 400.',
  required: ['platform', 'token'],
} as const;

export const PlatformCatalog = {
  type: 'object',
  properties: {
    _id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    name: {
      type: 'string',
      example: 'facebook',
      description: 'Any social platform slug, e.g. facebook, youtube, linkedin, reddit, twitter, instagram, tiktok.',
    },
    label: { type: 'string', example: 'Facebook' },
    is_enabled: { type: 'boolean', description: 'Global on/off switch — disabling immediately blocks every team from using this platform.' },
    created_by: { type: 'string' },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
  },
  required: ['name', 'is_enabled', 'created_by'],
} as const;

export const PlatformCatalogCreate = {
  type: 'object',
  properties: {
    name: { type: 'string', example: 'facebook' },
    label: { type: 'string', example: 'Facebook' },
    is_enabled: { type: 'boolean', default: true },
  },
  required: ['name'],
} as const;

export const TeamPlatform = {
  type: 'object',
  properties: {
    name: { type: 'string', example: 'facebook' },
    label: { type: 'string', example: 'Facebook' },
    team_enabled: { type: 'boolean', description: 'Whether this specific team currently has the platform turned on.' },
  },
  required: ['name', 'team_enabled'],
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
  },
  required: ['team_id', 'topic'],
} as const;

export const GeneratedContent = {
  type: 'object',
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
  },
  required: ['topic', 'facebook_post', 'facebook_reel_script', 'linkedin_post', 'youtube_idea', 'caption'],
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
