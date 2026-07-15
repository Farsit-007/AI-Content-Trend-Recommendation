/**
 * Hand-written paths for Analytics and Reports — query-driven read models plus an
 * admin refresh trigger, so they don't fit the generic CRUD shape in paths.ts.
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
const listEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    {
      type: 'object',
      properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } } },
    },
  ],
});
const bearerAuth = [{ bearerAuth: [] as string[] }];

export const analyticsReportPaths = {
  '/analytics': {
    get: {
      tags: ['Analytics'],
      summary: "Get a team's per-platform 30-day analytics rollups",
      security: bearerAuth,
      parameters: [
        { name: 'team_id', in: 'query', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': {
          description: 'One rollup per platform the team has enabled',
          content: { 'application/json': { schema: listEnvelope('AnalyticsRollup') } },
        },
        '401': errorResponse('Authentication required'),
      },
    },
  },
  '/analytics/refresh': {
    post: {
      tags: ['Analytics'],
      summary: 'Trigger an analytics refresh for all teams or one team (admin only)',
      security: bearerAuth,
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { team_id: { type: 'string', description: 'Omit to refresh every team.' } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Refresh summary ({ teamsProcessed, platformsProcessed })' },
        '403': errorResponse('Admin access required'),
      },
    },
  },
  '/reports': {
    get: {
      tags: ['Reports'],
      summary: "Get a team's cross-platform 30-day performance report (cached 6h)",
      security: bearerAuth,
      parameters: [
        { name: 'team_id', in: 'query', required: true, schema: { type: 'string' } },
        {
          name: 'refresh',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['true', 'false'] },
          description: 'Pass true to bypass the Redis cache and regenerate.',
        },
      ],
      responses: {
        '200': {
          description: 'Report with overview, per-platform summaries, AI insight, and content opportunities',
          content: { 'application/json': { schema: singleEnvelope('Report') } },
        },
        '401': errorResponse('Authentication required'),
      },
    },
  },
};
