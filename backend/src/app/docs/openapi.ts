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
    },
  },
};
