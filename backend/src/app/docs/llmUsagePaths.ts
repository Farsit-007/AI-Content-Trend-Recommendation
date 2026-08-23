/**
 * Hand-written path for GET /llm-usage — an aggregate read over the daily rollup, not a CRUD
 * resource, so it doesn't fit `buildResourcePaths` (paths.ts).
 */
const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});
const bearerAuth = [{ bearerAuth: [] as string[] }];

export const llmUsagePaths = {
  '/llm-usage': {
    get: {
      tags: ['LLM Usage'],
      summary: 'Token and cost totals for a team, from the daily rollup',
      description:
        'Scope rules: a super_admin may pass any `team_id`, or omit it for a platform-wide total. ' +
        'Anyone else can only ever see a team they belong to — omitting `team_id` resolves to their ' +
        'own team rather than widening to every team. Defaults to the last 30 days.',
      security: bearerAuth,
      parameters: [
        {
          name: 'team_id',
          in: 'query',
          schema: { type: 'string' },
          description:
            'Super admins only may name a team they are not a member of.',
        },
        {
          name: 'from',
          in: 'query',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          description:
            'Inclusive UTC start day. Defaults to 30 days before `to`.',
        },
        {
          name: 'to',
          in: 'query',
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          description: 'Inclusive UTC end day. Defaults to today.',
        },
      ],
      responses: {
        '200': {
          description: 'Usage summary',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  {
                    type: 'object',
                    properties: {
                      data: { $ref: '#/components/schemas/LlmUsageSummary' },
                    },
                  },
                ],
              },
            },
          },
        },
        '400': errorResponse(
          'Validation error — a date was not in YYYY-MM-DD form',
        ),
        '401': errorResponse('Authentication required'),
        '403': errorResponse('You do not have access to this team'),
      },
    },
  },
};
