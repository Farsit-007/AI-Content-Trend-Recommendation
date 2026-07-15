/**
 * OpenAPI 3.1 contract for the Growth Studio backend REST API.
 *
 * Single source of truth for the `/api/v1` surface. Served as raw JSON at
 * `/api/v1/openapi.json` and rendered via Swagger UI at `/api/v1/docs`.
 */
import {
  ErrorEnvelope,
  Meta,
  SuccessEnvelope,
} from './components';
import { buildResourcePaths } from './paths';
import { analyticsReportPaths } from './analyticsReportPaths';
import { authTeamPaths } from './authTeamPaths';
import { contentGenerationPaths } from './contentGenerationPaths';
import { chatPaths } from './chatPaths';
import { generatedContentPaths } from './generatedContentPaths';
import { newsItemPaths } from './newsItemPaths';
import {
  AddCategoryRequest,
  AskChatRequest,
  AskChatResponse,
  BrandVoiceExample,
  BrandVoiceExampleCreate,
  BrandVoiceExampleUpdate,
  ClearNewsItemOverrideRequest,
  GenerateContentRequest,
  GeneratedContent,
  IngestionSummary,
  LoginRequest,
  NewsItem,
  NewsItemCategoryOverride,
  NewsItemCreate,
  NewsItemUpdate,
  PlatformCatalog,
  PlatformCatalogCreate,
  TeamPlatform,
  PlatformCredential,
  PlatformCredentialCreate,
  PlatformPost,
  PlatformPostCreate,
  PlatformPostUpdate,
  SetNewsItemOverrideRequest,
  SourceSummary,
  Team,
  TeamCreate,
  User,
  UserCreate,
} from './schemas';

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Growth Studio API',
    version: '1.0.0',
    description:
      'AI Content & Trend Intelligence Platform — REST API contract. All responses use the standard success/error envelope.',
  },
  servers: [{ url: '/api/v1', description: 'API v1 base path' }],
  tags: [
    { name: 'Auth', description: 'Login and current-user session.' },
    { name: 'Users', description: 'Admin-only user account management.' },
    { name: 'Teams', description: 'Growth teams and their membership.' },
    { name: 'Platform Catalog', description: 'super_admin-curated list of platforms that exist in the system, and each team\'s own on/off switch for them.' },
    { name: 'Platform Credentials', description: "Encrypted, team-scoped social platform credentials." },
    { name: 'News Items', description: 'Ingested news/trend items with engagement and scoring.' },
    { name: 'Platform Posts', description: 'Historical platform posts and their metrics, scoped per team.' },
    { name: 'Brand Voice Examples', description: 'Reference examples of the desired brand voice, scoped per team.' },
    { name: 'Content Generation', description: 'RAG-grounded generation of multi-format social content from a topic or news item.' },
    { name: 'Chat', description: "Conversational Q&A grounded in the team's own trending news and platform performance data." },
    { name: 'Generated Content', description: 'Persisted generated content drafts; auto-generated daily per team in their brand voice.' },
    { name: 'Analytics', description: 'Per-team, per-platform 30-day analytics rollups and the admin refresh trigger.' },
    { name: 'Reports', description: 'Cross-platform 30-day performance report with AI insight and content opportunities.' },
  ],
  paths: {
    ...authTeamPaths,
    ...buildResourcePaths('/news-items', {
      singular: 'news item',
      tag: 'News Items',
      schema: 'NewsItem',
    }),
    ...newsItemPaths,
    ...buildResourcePaths('/platform-posts', {
      singular: 'platform post',
      tag: 'Platform Posts',
      schema: 'PlatformPost',
    }),
    ...buildResourcePaths('/brand-voice-examples', {
      singular: 'brand voice example',
      tag: 'Brand Voice Examples',
      schema: 'BrandVoiceExample',
    }),
    ...contentGenerationPaths,
    ...chatPaths,
    ...generatedContentPaths,
    ...analyticsReportPaths,
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      Meta,
      SuccessEnvelope,
      ErrorEnvelope,
      User,
      UserCreate,
      LoginRequest,
      Team,
      TeamCreate,
      PlatformCatalog,
      PlatformCatalogCreate,
      TeamPlatform,
      PlatformCredential,
      PlatformCredentialCreate,
      NewsItem,
      NewsItemCreate,
      NewsItemUpdate,
      PlatformPost,
      PlatformPostCreate,
      PlatformPostUpdate,
      BrandVoiceExample,
      BrandVoiceExampleCreate,
      BrandVoiceExampleUpdate,
      GenerateContentRequest,
      GeneratedContent,
      AskChatRequest,
      AskChatResponse,
      SourceSummary,
      IngestionSummary,
      SetNewsItemOverrideRequest,
      ClearNewsItemOverrideRequest,
      NewsItemCategoryOverride,
      AddCategoryRequest,
      GeneratedContentDoc: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          team_id: { type: 'string' },
          news_item_id: { type: 'string' },
          topic: { type: 'string' },
          formats: { $ref: '#/components/schemas/GeneratedContent' },
          source: { type: 'string', enum: ['auto', 'manual'] },
          status: { type: 'string', enum: ['draft', 'approved', 'dismissed'] },
          model_used: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      AutoGenerationSummary: {
        type: 'object',
        properties: {
          teams_processed: { type: 'integer' },
          drafts_created: { type: 'integer' },
          skipped: { type: 'integer' },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'Short-lived JWT access token — send as `Authorization: Bearer`.' },
          refresh_token: {
            type: 'string',
            description: 'Long-lived refresh token; also set as an httpOnly cookie for browser clients.',
          },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['old_password', 'new_password'],
        properties: {
          old_password: { type: 'string' },
          new_password: { type: 'string', minLength: 8 },
        },
      },
      AnalyticsRollup: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          team_id: { type: 'string' },
          platform: { type: 'string' },
          status: { type: 'string', enum: ['ok', 'not_connected', 'pending_approval', 'error'] },
          period: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' },
            },
          },
          overview: {
            type: 'object',
            properties: {
              reach: { type: 'number' },
              engagements: { type: 'number' },
              views: { type: 'number' },
              engagement_rate: { type: 'number' },
            },
          },
          top_posts: { type: 'array', items: { type: 'object' } },
          best_times: { type: 'array', items: { type: 'object' } },
          content_breakdown: { type: 'array', items: { type: 'object' } },
          fetched_at: { type: 'string', format: 'date-time' },
        },
      },
      Report: {
        type: 'object',
        properties: {
          team_id: { type: 'string' },
          period: {
            type: 'object',
            properties: {
              start: { type: 'string', format: 'date-time' },
              end: { type: 'string', format: 'date-time' },
            },
          },
          overview: {
            type: 'object',
            properties: {
              total_reach: { type: 'number' },
              total_engagements: { type: 'number' },
              total_views: { type: 'number' },
              avg_engagement_rate: { type: 'number' },
            },
          },
          platform_summaries: { type: 'object', additionalProperties: { type: 'object' } },
          ai_insight: { type: 'string', description: 'AI-generated narrative insight (Bangla/Banglish).' },
          content_opportunities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                rank: { type: 'integer' },
                topic: { type: 'string' },
                formats: { type: 'array', items: { type: 'string' } },
                opportunity_score: { type: 'number' },
                reason: { type: 'string' },
              },
            },
          },
          generated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};
