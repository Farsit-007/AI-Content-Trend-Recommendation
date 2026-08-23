/**
 * OpenAPI 3.1 contract for the Growth Studio backend REST API.
 *
 * Single source of truth for the `/api/v1` surface. Served as raw JSON at
 * `/api/v1/openapi.json` and rendered via Swagger UI at `/api/v1/docs`.
 */
import { ErrorEnvelope, Meta, SuccessEnvelope } from './components';
import { buildResourcePaths } from './paths';
import { authTeamPaths } from './authTeamPaths';
import { contentGenerationPaths } from './contentGenerationPaths';
import { chatPaths } from './chatPaths';
import { generatedContentPaths } from './generatedContentPaths';
import { llmProviderPaths } from './llmProviderPaths';
import { newsItemPaths } from './newsItemPaths';
import { stylePackPaths } from './stylePackPaths';
import {
  AddCategoryRequest,
  AskChatRequest,
  AskChatResponse,
  ChatSourceRef,
  BrandVoiceExample,
  BrandVoiceExampleCreate,
  BrandVoiceExampleUpdate,
  ClearNewsItemOverrideRequest,
  CreateDraftRequest,
  GenerateContentRequest,
  GeneratedContent,
  IngestionSummary,
  LlmModel,
  LlmModelActive,
  LlmModelCreate,
  LlmProvider,
  LlmProviderAddKey,
  LlmProviderCreate,
  LlmProviderKey,
  LlmProviderKeyReveal,
  LlmTaskDefault,
  LlmTaskDefaultSet,
  LoginRequest,
  NewsItem,
  NewsItemCategoryOverride,
  NewsItemCreate,
  NewsItemUpdate,
  RefineContentRequest,
  RefineContentResponse,
  SetNewsItemOverrideRequest,
  SourceSummary,
  StyleCardGenerateResult,
  StyleExample,
  StyleExampleBulkCreate,
  StyleExampleBulkResult,
  StyleExampleCreate,
  StylePack,
  StylePackCreate,
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
    {
      name: 'News Items',
      description: 'Ingested news/trend items with engagement and scoring.',
    },
    {
      name: 'Brand Voice Examples',
      description:
        'Reference examples of the desired brand voice, scoped per team.',
    },
    {
      name: 'Content Generation',
      description:
        'RAG-grounded generation of multi-format social content from a topic or news item.',
    },
    {
      name: 'Chat',
      description:
        "Conversational Q&A grounded in the team's own trending news.",
    },
    {
      name: 'Generated Content',
      description:
        'Persisted generated content drafts; auto-generated daily per team in their brand voice.',
    },
    {
      name: 'Style Packs',
      description:
        'Globally shared, super_admin-curated writer styles (packs + examples) teams can opt into.',
    },
    {
      name: 'LLM Providers',
      description:
        'Super-admin-managed registry of LLM providers, encrypted API keys, and per-provider model catalogs, wired into live generation via per-task model resolution (request > team default > global default > .env bootstrap).',
    },
  ],
  paths: {
    ...authTeamPaths,
    ...buildResourcePaths('/news-items', {
      singular: 'news item',
      tag: 'News Items',
      schema: 'NewsItem',
    }),
    ...newsItemPaths,
    ...buildResourcePaths('/brand-voice-examples', {
      singular: 'brand voice example',
      tag: 'Brand Voice Examples',
      schema: 'BrandVoiceExample',
    }),
    ...contentGenerationPaths,
    ...chatPaths,
    ...generatedContentPaths,
    ...stylePackPaths,
    ...llmProviderPaths,
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
      NewsItem,
      NewsItemCreate,
      NewsItemUpdate,
      BrandVoiceExample,
      BrandVoiceExampleCreate,
      BrandVoiceExampleUpdate,
      GenerateContentRequest,
      GeneratedContent,
      RefineContentRequest,
      RefineContentResponse,
      CreateDraftRequest,
      AskChatRequest,
      AskChatResponse,
      ChatSourceRef,
      SourceSummary,
      IngestionSummary,
      SetNewsItemOverrideRequest,
      ClearNewsItemOverrideRequest,
      NewsItemCategoryOverride,
      AddCategoryRequest,
      StylePack,
      StylePackCreate,
      StyleExample,
      StyleExampleCreate,
      StyleExampleBulkCreate,
      StyleExampleBulkResult,
      StyleCardGenerateResult,
      LlmProvider,
      LlmProviderCreate,
      LlmProviderKey,
      LlmProviderAddKey,
      LlmProviderKeyReveal,
      LlmModel,
      LlmModelCreate,
      LlmModelActive,
      LlmTaskDefault,
      LlmTaskDefaultSet,
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
          token: {
            type: 'string',
            description:
              'Short-lived JWT access token — send as `Authorization: Bearer`.',
          },
          refresh_token: {
            type: 'string',
            description:
              'Long-lived refresh token; also set as an httpOnly cookie for browser clients.',
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
    },
  },
};
