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
import {
  BrandVoiceExample,
  BrandVoiceExampleCreate,
  BrandVoiceExampleUpdate,
  NewsItem,
  NewsItemCreate,
  NewsItemUpdate,
  PlatformPost,
  PlatformPostCreate,
  PlatformPostUpdate,
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
    { name: 'News Items', description: 'Ingested news/trend items with engagement and scoring.' },
    { name: 'Platform Posts', description: 'Historical platform posts and their metrics.' },
    { name: 'Brand Voice Examples', description: 'Reference examples of the desired brand voice.' },
  ],
  paths: {
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
    schemas: {
      Meta,
      SuccessEnvelope,
      ErrorEnvelope,
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
