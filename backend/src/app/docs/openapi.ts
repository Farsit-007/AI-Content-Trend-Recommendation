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
import {
  BrandVoiceExample,
  BrandVoiceExampleCreate,
  BrandVoiceExampleUpdate,
  LoginRequest,
  NewsItem,
  NewsItemCreate,
  NewsItemUpdate,
  PlatformCredential,
  PlatformCredentialCreate,
  PlatformPost,
  PlatformPostCreate,
  PlatformPostUpdate,
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
    { name: 'Platform Credentials', description: "Encrypted, team-scoped social platform credentials." },
    { name: 'News Items', description: 'Ingested news/trend items with engagement and scoring.' },
    { name: 'Platform Posts', description: 'Historical platform posts and their metrics, scoped per team.' },
    { name: 'Brand Voice Examples', description: 'Reference examples of the desired brand voice, scoped per team.' },
  ],
  paths: {
    ...authTeamPaths,
    ...buildResourcePaths('/news-items', {
      singular: 'news item',
      tag: 'News Items',
      schema: 'NewsItem',
    }),
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
    },
  },
};
