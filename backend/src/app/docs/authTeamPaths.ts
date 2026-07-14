/**
 * Hand-written paths for Auth / Users / Teams / Platform Credentials — these don't fit the
 * generic CRUD shape `buildResourcePaths` (paths.ts) assumes, so they're authored directly.
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
const jsonBody = (schemaName: string) => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
});
const bearerAuth = [{ bearerAuth: [] as string[] }];

export const authTeamPaths = {
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Log in',
      requestBody: jsonBody('LoginRequest'),
      responses: {
        '200': { description: 'Logged in', content: { 'application/json': { schema: singleEnvelope('User') } } },
        '401': errorResponse('Invalid email or password'),
      },
    },
  },
  '/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Get the current authenticated user',
      security: bearerAuth,
      responses: {
        '200': { description: 'Current user', content: { 'application/json': { schema: singleEnvelope('User') } } },
        '401': errorResponse('Authentication required'),
      },
    },
  },
  '/users': {
    post: {
      tags: ['Users'],
      summary: 'Create a user (admin only)',
      security: bearerAuth,
      requestBody: jsonBody('UserCreate'),
      responses: {
        '201': { description: 'User created', content: { 'application/json': { schema: singleEnvelope('User') } } },
        '400': errorResponse('Validation error'),
        '403': errorResponse('Admin access required'),
      },
    },
    get: {
      tags: ['Users'],
      summary: 'List users (admin only)',
      security: bearerAuth,
      parameters: [
        { name: 'team_id', in: 'query', required: false, schema: { type: 'string' }, description: 'Filter to one team\'s roster.' },
      ],
      responses: {
        '200': { description: 'Users', content: { 'application/json': { schema: listEnvelope('User') } } },
        '403': errorResponse('Admin access required'),
      },
    },
  },
  '/teams': {
    post: {
      tags: ['Teams'],
      summary: 'Create a team (admin only)',
      security: bearerAuth,
      requestBody: jsonBody('TeamCreate'),
      responses: {
        '201': { description: 'Team created', content: { 'application/json': { schema: singleEnvelope('Team') } } },
        '403': errorResponse('Admin access required'),
      },
    },
    get: {
      tags: ['Teams'],
      summary: 'List teams — all teams for admins, own teams otherwise',
      security: bearerAuth,
      responses: {
        '200': { description: 'Teams', content: { 'application/json': { schema: listEnvelope('Team') } } },
      },
    },
  },
  '/teams/{teamId}': {
    get: {
      tags: ['Teams'],
      summary: 'Get a team and its member roster',
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Team', content: { 'application/json': { schema: singleEnvelope('Team') } } },
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('Team not found'),
      },
    },
    patch: {
      tags: ['Teams'],
      summary: 'Update a team (admin only)',
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Team updated', content: { 'application/json': { schema: singleEnvelope('Team') } } },
        '403': errorResponse('Admin access required'),
        '404': errorResponse('Team not found'),
      },
    },
    delete: {
      tags: ['Teams'],
      summary: 'Delete a team (admin only)',
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Team deleted', content: { 'application/json': { schema: singleEnvelope('Team') } } },
        '403': errorResponse('Admin access required'),
        '404': errorResponse('Team not found'),
      },
    },
  },
  '/teams/{teamId}/members': {
    post: {
      tags: ['Teams'],
      summary: 'Add a member to a team (admin only)',
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '201': { description: 'Member added' },
        '403': errorResponse('Admin access required'),
        '409': errorResponse('User is already a member of this team'),
      },
    },
  },
  '/teams/{teamId}/members/{userId}': {
    delete: {
      tags: ['Teams'],
      summary: 'Remove a member from a team (admin only)',
      security: bearerAuth,
      parameters: [
        { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Member removed' },
        '403': errorResponse('Admin access required'),
        '404': errorResponse('User is not a member of this team'),
      },
    },
  },
  '/teams/{teamId}/categories': {
    get: {
      tags: ['Teams'],
      summary: "Get a team's effective categories (built-in defaults + custom)",
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Effective category list',
          content: {
            'application/json': {
              schema: {
                allOf: [
                  { $ref: '#/components/schemas/SuccessEnvelope' },
                  { type: 'object', properties: { data: { type: 'array', items: { type: 'string' } } } },
                ],
              },
            },
          },
        },
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('Team not found'),
      },
    },
    post: {
      tags: ['Teams'],
      summary: 'Add a custom category to a team',
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody('AddCategoryRequest'),
      responses: {
        '201': { description: 'Category added', content: { 'application/json': { schema: singleEnvelope('Team') } } },
        '400': errorResponse('That category already exists for this team, or the 20-category limit was reached'),
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('Team not found'),
      },
    },
  },
  '/teams/{teamId}/categories/{category}': {
    delete: {
      tags: ['Teams'],
      summary: 'Remove a custom category from a team',
      security: bearerAuth,
      parameters: [
        { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'category', in: 'path', required: true, schema: { type: 'string' }, description: 'Only removes team-added custom categories, not the built-in defaults.' },
      ],
      responses: {
        '200': { description: 'Category removed', content: { 'application/json': { schema: singleEnvelope('Team') } } },
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('Team not found, or that custom category does not exist for this team'),
      },
    },
  },
  '/teams/{teamId}/credentials': {
    post: {
      tags: ['Platform Credentials'],
      summary: 'Save (or rotate) a platform credential for a team',
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: jsonBody('PlatformCredentialCreate'),
      responses: {
        '201': {
          description: 'Credential saved (masked)',
          content: { 'application/json': { schema: singleEnvelope('PlatformCredential') } },
        },
        '403': errorResponse('You do not have access to this team'),
      },
    },
    get: {
      tags: ['Platform Credentials'],
      summary: "List a team's platform credentials (masked)",
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': {
          description: 'Credentials (masked)',
          content: { 'application/json': { schema: listEnvelope('PlatformCredential') } },
        },
        '403': errorResponse('You do not have access to this team'),
      },
    },
  },
  '/teams/{teamId}/credentials/{platform}/reveal': {
    get: {
      tags: ['Platform Credentials'],
      summary: 'Reveal the plaintext token for one platform credential',
      security: bearerAuth,
      parameters: [
        { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'platform', in: 'path', required: true, schema: { type: 'string' }, description: 'Any social platform slug, e.g. facebook, youtube, linkedin, reddit, twitter, instagram, tiktok.' },
      ],
      responses: {
        '200': { description: 'Decrypted token' },
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('No credential stored for this platform'),
      },
    },
  },
  '/teams/{teamId}/credentials/{platform}': {
    delete: {
      tags: ['Platform Credentials'],
      summary: 'Delete a platform credential',
      security: bearerAuth,
      parameters: [
        { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'platform', in: 'path', required: true, schema: { type: 'string' }, description: 'Any social platform slug, e.g. facebook, youtube, linkedin, reddit, twitter, instagram, tiktok.' },
      ],
      responses: {
        '200': { description: 'Credential deleted' },
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('No credential stored for this platform'),
      },
    },
  },
  '/platforms': {
    post: {
      tags: ['Platform Catalog'],
      summary: 'Add a platform to the catalog (super_admin only)',
      security: bearerAuth,
      requestBody: jsonBody('PlatformCatalogCreate'),
      responses: {
        '201': { description: 'Platform added', content: { 'application/json': { schema: singleEnvelope('PlatformCatalog') } } },
        '403': errorResponse('Super admin access required'),
        '409': errorResponse('Platform already exists in the catalog'),
      },
    },
    get: {
      tags: ['Platform Catalog'],
      summary: 'List platforms — every entry for super_admin, only enabled ones otherwise',
      security: bearerAuth,
      responses: {
        '200': { description: 'Platforms', content: { 'application/json': { schema: listEnvelope('PlatformCatalog') } } },
      },
    },
  },
  '/platforms/{name}/enable': {
    patch: {
      tags: ['Platform Catalog'],
      summary: 'Enable a platform globally (super_admin only)',
      security: bearerAuth,
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Platform enabled', content: { 'application/json': { schema: singleEnvelope('PlatformCatalog') } } },
        '403': errorResponse('Super admin access required'),
        '404': errorResponse('Platform is not in the catalog'),
      },
    },
  },
  '/platforms/{name}/disable': {
    patch: {
      tags: ['Platform Catalog'],
      summary: 'Disable a platform globally — immediately blocks every team from using it (super_admin only)',
      security: bearerAuth,
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Platform disabled', content: { 'application/json': { schema: singleEnvelope('PlatformCatalog') } } },
        '403': errorResponse('Super admin access required'),
        '404': errorResponse('Platform is not in the catalog'),
      },
    },
  },
  '/platforms/{name}': {
    delete: {
      tags: ['Platform Catalog'],
      summary: 'Remove a platform from the catalog (super_admin only)',
      security: bearerAuth,
      parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Platform removed', content: { 'application/json': { schema: singleEnvelope('PlatformCatalog') } } },
        '403': errorResponse('Super admin access required'),
        '404': errorResponse('Platform is not in the catalog'),
      },
    },
  },
  '/teams/{teamId}/platforms': {
    get: {
      tags: ['Platform Catalog'],
      summary: "List a team's platforms — every globally-enabled catalog platform, with this team's own enabled/disabled status",
      security: bearerAuth,
      parameters: [{ name: 'teamId', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: "Team's platforms", content: { 'application/json': { schema: listEnvelope('TeamPlatform') } } },
        '403': errorResponse('You do not have access to this team'),
      },
    },
  },
  '/teams/{teamId}/platforms/{platform}/enable': {
    post: {
      tags: ['Platform Catalog'],
      summary: 'Enable a platform for this team',
      security: bearerAuth,
      parameters: [
        { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'platform', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Platform enabled for team' },
        '400': errorResponse('Platform is not currently available — ask a super_admin to add or enable it first'),
        '403': errorResponse('You do not have access to this team'),
      },
    },
  },
  '/teams/{teamId}/platforms/{platform}/disable': {
    post: {
      tags: ['Platform Catalog'],
      summary: 'Disable a platform for this team',
      security: bearerAuth,
      parameters: [
        { name: 'teamId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'platform', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Platform disabled for team' },
        '403': errorResponse('You do not have access to this team'),
        '404': errorResponse('Team has not enabled this platform'),
      },
    },
  },
};
