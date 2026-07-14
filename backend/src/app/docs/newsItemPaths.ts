/**
 * Hand-written paths for /news-items/ingest and /news-items/{id}/override — these don't fit
 * the generic CRUD shape `buildResourcePaths` (paths.ts) assumes, so they're authored directly.
 */
const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});
const singleEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    { type: 'object', properties: { data: { $ref: `#/components/schemas/${schemaName}` } } },
  ],
});
const jsonBody = (schemaName: string) => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
});
const bearerAuth = [{ bearerAuth: [] as string[] }];

export const newsItemPaths = {
  '/news-items/ingest': {
    post: {
      tags: ['News Items'],
      summary: 'Run the news ingestion pipeline (admin only)',
      description:
        'Synchronously runs all 4 layers — fetch & normalize from every source adapter, dedupe & freshness filter (incl. cross-source semantic dedupe), relevance & trend scoring, categorize & opportunity scoring — then stores the survivors.',
      security: bearerAuth,
      responses: {
        '200': {
          description: 'Ingestion run complete',
          content: { 'application/json': { schema: singleEnvelope('IngestionSummary') } },
        },
        '403': errorResponse('Admin access required'),
      },
    },
  },
  '/news-items/{id}/override': {
    patch: {
      tags: ['News Items'],
      summary: "Set a team's category/opportunity_score override for a news item",
      security: bearerAuth,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody('SetNewsItemOverrideRequest'),
      responses: {
        '200': {
          description: 'Override saved',
          content: { 'application/json': { schema: singleEnvelope('NewsItemCategoryOverride') } },
        },
        '400': errorResponse('Validation error, or category is not one of the team\'s effective categories'),
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('News item not found'),
      },
    },
    delete: {
      tags: ['News Items'],
      summary: "Clear a team's category/opportunity_score override for a news item",
      security: bearerAuth,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody('ClearNewsItemOverrideRequest'),
      responses: {
        '200': {
          description: 'Override cleared',
          content: { 'application/json': { schema: singleEnvelope('NewsItemCategoryOverride') } },
        },
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('No override exists for this team on this news item'),
      },
    },
  },
};
