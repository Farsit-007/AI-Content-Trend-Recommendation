const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});
const listEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    { type: 'object', properties: { data: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } } } },
  ],
});
const singleEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    { type: 'object', properties: { data: { $ref: `#/components/schemas/${schemaName}` } } },
  ],
});
const bearerAuth = [{ bearerAuth: [] as string[] }];
const superAdminOnly = errorResponse('Super admin access required');
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const keyIdParam = { name: 'keyId', in: 'path', required: true, schema: { type: 'string' } };
const modelIdParam = { name: 'modelId', in: 'path', required: true, schema: { type: 'string' } };

export const llmProviderPaths = {
  '/llm-providers': {
    post: {
      tags: ['LLM Providers'],
      summary: 'Create an LLM provider (super_admin only)',
      security: bearerAuth,
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LlmProviderCreate' } } } },
      responses: {
        '201': { description: 'Created provider', content: { 'application/json': { schema: singleEnvelope('LlmProvider') } } },
        '400': errorResponse('Validation error (invalid provider_type)'),
        '403': superAdminOnly,
      },
    },
    get: {
      tags: ['LLM Providers'],
      summary: 'List LLM providers (super_admin only); keys are masked to key_last4',
      security: bearerAuth,
      responses: {
        '200': { description: 'Provider list', content: { 'application/json': { schema: listEnvelope('LlmProvider') } } },
        '403': superAdminOnly,
      },
    },
  },
  '/llm-providers/{id}': {
    get: {
      tags: ['LLM Providers'],
      summary: 'Get an LLM provider (super_admin only); keys are masked to key_last4',
      security: bearerAuth,
      parameters: [idParam],
      responses: {
        '200': { description: 'Provider detail', content: { 'application/json': { schema: singleEnvelope('LlmProvider') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider not found'),
      },
    },
    patch: {
      tags: ['LLM Providers'],
      summary: 'Update a provider\'s name/is_active (super_admin only)',
      security: bearerAuth,
      parameters: [idParam],
      responses: {
        '200': { description: 'Updated provider', content: { 'application/json': { schema: singleEnvelope('LlmProvider') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider not found'),
      },
    },
    delete: {
      tags: ['LLM Providers'],
      summary: 'Delete a provider; cascades its model catalog (super_admin only)',
      security: bearerAuth,
      parameters: [idParam],
      responses: {
        '200': { description: 'Deleted provider', content: { 'application/json': { schema: singleEnvelope('LlmProvider') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider not found'),
      },
    },
  },
  '/llm-providers/{id}/keys': {
    post: {
      tags: ['LLM Providers'],
      summary: 'Add an API key to a provider; encrypted at rest (super_admin only)',
      security: bearerAuth,
      parameters: [idParam],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LlmProviderAddKey' } } } },
      responses: {
        '201': { description: 'Provider with the new key added (masked)', content: { 'application/json': { schema: singleEnvelope('LlmProvider') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider not found'),
      },
    },
  },
  '/llm-providers/{id}/keys/{keyId}': {
    patch: {
      tags: ['LLM Providers'],
      summary: "Toggle a key's is_active flag or update its label (super_admin only)",
      security: bearerAuth,
      parameters: [idParam, keyIdParam],
      responses: {
        '200': { description: 'Updated provider (masked)', content: { 'application/json': { schema: singleEnvelope('LlmProvider') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider or key not found'),
      },
    },
    delete: {
      tags: ['LLM Providers'],
      summary: 'Remove a key from a provider (super_admin only)',
      security: bearerAuth,
      parameters: [idParam, keyIdParam],
      responses: {
        '200': { description: 'Updated provider (masked)', content: { 'application/json': { schema: singleEnvelope('LlmProvider') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider or key not found'),
      },
    },
  },
  '/llm-providers/{id}/keys/{keyId}/reveal': {
    post: {
      tags: ['LLM Providers'],
      summary: 'Decrypt and return the real plaintext key value (super_admin only)',
      security: bearerAuth,
      parameters: [idParam, keyIdParam],
      responses: {
        '200': { description: 'Decrypted key', content: { 'application/json': { schema: singleEnvelope('LlmProviderKeyReveal') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider or key not found'),
      },
    },
  },
  '/llm-providers/{id}/models': {
    post: {
      tags: ['LLM Providers'],
      summary: 'Add a model to a provider\'s catalog (super_admin only)',
      security: bearerAuth,
      parameters: [idParam],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LlmModelCreate' } } } },
      responses: {
        '201': { description: 'Created model', content: { 'application/json': { schema: singleEnvelope('LlmModel') } } },
        '403': superAdminOnly,
        '404': errorResponse('Provider not found'),
      },
    },
    get: {
      tags: ['LLM Providers'],
      summary: "List a provider's model catalog (super_admin only)",
      security: bearerAuth,
      parameters: [idParam],
      responses: {
        '200': { description: 'Model list', content: { 'application/json': { schema: listEnvelope('LlmModel') } } },
        '403': superAdminOnly,
      },
    },
  },
  '/llm-providers/{id}/models/{modelId}': {
    patch: {
      tags: ['LLM Providers'],
      summary: 'Update a model (super_admin only)',
      security: bearerAuth,
      parameters: [idParam, modelIdParam],
      responses: {
        '200': { description: 'Updated model', content: { 'application/json': { schema: singleEnvelope('LlmModel') } } },
        '403': superAdminOnly,
        '404': errorResponse('Model not found'),
      },
    },
    delete: {
      tags: ['LLM Providers'],
      summary: 'Delete a model (super_admin only)',
      security: bearerAuth,
      parameters: [idParam, modelIdParam],
      responses: {
        '200': { description: 'Deleted model', content: { 'application/json': { schema: singleEnvelope('LlmModel') } } },
        '403': superAdminOnly,
        '404': errorResponse('Model not found'),
      },
    },
  },
  '/llm-providers/models/active': {
    get: {
      tags: ['LLM Providers'],
      summary: 'List active, chat-capable models across every active provider (any authenticated user)',
      description: 'Not super-admin-only — this is what the Generate page model picker calls to populate its dropdown.',
      security: bearerAuth,
      responses: {
        '200': { description: 'Active model list', content: { 'application/json': { schema: listEnvelope('LlmModelActive') } } },
        '401': errorResponse('Authentication required'),
      },
    },
  },
  '/llm-providers/task-defaults': {
    get: {
      tags: ['LLM Providers'],
      summary: 'List every task that has a global default model set (super_admin only)',
      security: bearerAuth,
      responses: {
        '200': { description: 'Task default list', content: { 'application/json': { schema: listEnvelope('LlmTaskDefault') } } },
        '403': superAdminOnly,
      },
    },
  },
  '/llm-providers/task-defaults/{task}': {
    put: {
      tags: ['LLM Providers'],
      summary: 'Set (or replace) the global default model for one task (super_admin only)',
      description: 'One row per task — calling this again for the same task replaces the prior default (upsert), not a duplicate row.',
      security: bearerAuth,
      parameters: [
        {
          name: 'task',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: [
              'content_generation',
              'chat',
              'categorization',
              'dedup_adjudication',
              'style_card',
              'critique',
              'fact_extraction',
              'embedding',
            ],
          },
        },
      ],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LlmTaskDefaultSet' } } } },
      responses: {
        '200': { description: 'The task default, upserted', content: { 'application/json': { schema: singleEnvelope('LlmTaskDefault') } } },
        '400': errorResponse('Validation error (invalid task name or llm_model_id)'),
        '403': superAdminOnly,
        '404': errorResponse('LLM model not found'),
      },
    },
    delete: {
      tags: ['LLM Providers'],
      summary: 'Unset a task\'s global default (super_admin only)',
      description: 'Resolution for that task falls through straight to the team tier (if any) then bootstrap.',
      security: bearerAuth,
      parameters: [
        {
          name: 'task',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            enum: [
              'content_generation',
              'chat',
              'categorization',
              'dedup_adjudication',
              'style_card',
              'critique',
              'fact_extraction',
              'embedding',
            ],
          },
        },
      ],
      responses: {
        '200': { description: 'The cleared task default', content: { 'application/json': { schema: singleEnvelope('LlmTaskDefault') } } },
        '403': superAdminOnly,
        '404': errorResponse('No global default is set for that task'),
      },
    },
  },
};
