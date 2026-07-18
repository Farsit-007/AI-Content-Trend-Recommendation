/**
 * Hand-written paths for Auth / Users / Teams — these don't fit the
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
  '/auth/refresh-token': {
    post: {
      tags: ['Auth'],
      summary: 'Exchange a refresh token for a fresh access token (rotates the refresh token)',
      description:
        'The refresh token is read from the httpOnly `refresh_token` cookie set at login; non-browser clients can pass it in the body instead.',
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { refresh_token: { type: 'string' } } },
          },
        },
      },
      responses: {
        '200': {
          description: 'New token pair',
          content: { 'application/json': { schema: singleEnvelope('AuthTokens') } },
        },
        '401': errorResponse('Invalid or expired refresh token'),
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Log out — clears the refresh cookie; drop the access token client-side',
      responses: {
        '200': { description: 'Logged out' },
      },
    },
  },
  '/auth/change-password': {
    post: {
      tags: ['Auth'],
      summary: 'Change the current user\'s password (invalidates all previously issued tokens)',
      security: bearerAuth,
      requestBody: jsonBody('ChangePasswordRequest'),
      responses: {
        '200': {
          description: 'Password changed; a fresh token pair is returned',
          content: { 'application/json': { schema: singleEnvelope('AuthTokens') } },
        },
        '401': errorResponse('Current password is incorrect'),
      },
    },
  },
  '/auth/forgot-password': {
    post: {
      tags: ['Auth'],
      summary: 'Request a password reset token',
      description:
        'Always responds 200 regardless of whether the email has an account (no enumeration). No SMTP is configured, so the token is logged server-side; outside production it is also returned in the response body for development.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
          },
        },
      },
      responses: {
        '200': { description: 'Reset token issued if the account exists' },
      },
    },
  },
  '/auth/reset-password': {
    post: {
      tags: ['Auth'],
      summary: 'Reset the password using a reset token (single-use, 15 min expiry)',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'new_password'],
              properties: { token: { type: 'string' }, new_password: { type: 'string', minLength: 8 } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Password reset' },
        '401': errorResponse('Invalid or expired reset token'),
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
};
