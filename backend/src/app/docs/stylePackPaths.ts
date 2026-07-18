const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorRef } },
});
const listEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } },
      },
    },
  ],
});
const paginatedEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    {
      type: 'object',
      properties: {
        data: { type: 'array', items: { $ref: `#/components/schemas/${schemaName}` } },
        meta: { $ref: '#/components/schemas/Meta' },
      },
    },
  ],
});
const singleEnvelope = (schemaName: string) => ({
  allOf: [
    { $ref: '#/components/schemas/SuccessEnvelope' },
    { type: 'object', properties: { data: { $ref: `#/components/schemas/${schemaName}` } } },
  ],
});
const bearerAuth = [{ bearerAuth: [] as string[] }];

export const stylePackPaths = {
  '/style-packs': {
    post: {
      tags: ['Style Packs'],
      summary: 'Create a style pack (super_admin only)',
      security: bearerAuth,
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StylePackCreate' } } } },
      responses: {
        '201': { description: 'Created style pack', content: { 'application/json': { schema: singleEnvelope('StylePack') } } },
        '403': errorResponse('Super admin access required'),
      },
    },
    get: {
      tags: ['Style Packs'],
      summary: 'List style packs',
      security: bearerAuth,
      parameters: [
        {
          name: 'include_inactive',
          in: 'query',
          schema: { type: 'string', enum: ['true', 'false'] },
          description: 'super_admin only — include inactive packs in the list',
        },
      ],
      responses: {
        '200': { description: 'Style pack list', content: { 'application/json': { schema: listEnvelope('StylePack') } } },
      },
    },
  },
  '/style-packs/{id}': {
    get: {
      tags: ['Style Packs'],
      summary: 'Get a style pack with its example count',
      security: bearerAuth,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Style pack detail', content: { 'application/json': { schema: singleEnvelope('StylePack') } } },
        '404': errorResponse('Style pack not found'),
      },
    },
    patch: {
      tags: ['Style Packs'],
      summary: 'Update a style pack, e.g. retire via is_active (super_admin only)',
      security: bearerAuth,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/StylePackCreate' } } } },
      responses: {
        '200': { description: 'Updated style pack', content: { 'application/json': { schema: singleEnvelope('StylePack') } } },
        '403': errorResponse('Super admin access required'),
        '404': errorResponse('Style pack not found'),
      },
    },
    delete: {
      tags: ['Style Packs'],
      summary: 'Hard-delete a style pack and cascade-delete its examples (super_admin only)',
      security: bearerAuth,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: {
        '200': { description: 'Deleted style pack', content: { 'application/json': { schema: singleEnvelope('StylePack') } } },
        '403': errorResponse('Super admin access required'),
        '404': errorResponse('Style pack not found'),
      },
    },
  },
  '/style-packs/{id}/examples': {
    post: {
      tags: ['Style Packs'],
      summary: 'Add an example to a style pack; embeds content server-side (super_admin only)',
      security: bearerAuth,
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StyleExampleCreate' } } } },
      responses: {
        '201': { description: 'Created style example', content: { 'application/json': { schema: singleEnvelope('StyleExample') } } },
        '403': errorResponse('Super admin access required'),
        '404': errorResponse('Style pack not found'),
      },
    },
    get: {
      tags: ['Style Packs'],
      summary: "List a style pack's examples",
      security: bearerAuth,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'page', in: 'query', schema: { type: 'string' } },
        { name: 'limit', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Style example list', content: { 'application/json': { schema: paginatedEnvelope('StyleExample') } } },
      },
    },
  },
  '/style-packs/{id}/examples/{exampleId}': {
    delete: {
      tags: ['Style Packs'],
      summary: 'Delete a style example (super_admin only)',
      security: bearerAuth,
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'exampleId', in: 'path', required: true, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Deleted style example', content: { 'application/json': { schema: singleEnvelope('StyleExample') } } },
        '403': errorResponse('Super admin access required'),
        '404': errorResponse('Style example not found'),
      },
    },
  },
};
