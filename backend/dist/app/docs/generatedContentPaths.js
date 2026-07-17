"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatedContentPaths = void 0;
const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description) => ({
    description,
    content: { 'application/json': { schema: errorRef } },
});
const listEnvelope = (schemaName) => ({
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
const singleEnvelope = (schemaName) => ({
    allOf: [
        { $ref: '#/components/schemas/SuccessEnvelope' },
        { type: 'object', properties: { data: { $ref: `#/components/schemas/${schemaName}` } } },
    ],
});
const bearerAuth = [{ bearerAuth: [] }];
exports.generatedContentPaths = {
    '/generated-content': {
        get: {
            tags: ['Generated Content'],
            summary: 'List generated content drafts for a team',
            security: bearerAuth,
            parameters: [
                { name: 'team_id', in: 'query', required: true, schema: { type: 'string' } },
                { name: 'status', in: 'query', schema: { type: 'string', enum: ['draft', 'approved', 'dismissed'] } },
                { name: 'source', in: 'query', schema: { type: 'string', enum: ['auto', 'manual'] } },
                { name: 'page', in: 'query', schema: { type: 'string' } },
                { name: 'limit', in: 'query', schema: { type: 'string' } },
            ],
            responses: {
                '200': {
                    description: 'Generated content list',
                    content: { 'application/json': { schema: listEnvelope('GeneratedContentDoc') } },
                },
                '403': errorResponse('You do not have access to this team'),
            },
        },
    },
    '/generated-content/run': {
        post: {
            tags: ['Generated Content'],
            summary: 'Trigger auto-generation job (admin only)',
            security: bearerAuth,
            requestBody: {
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: { team_id: { type: 'string', description: 'Limit run to a single team' } },
                        },
                    },
                },
            },
            responses: {
                '200': {
                    description: 'Auto-generation summary',
                    content: { 'application/json': { schema: singleEnvelope('AutoGenerationSummary') } },
                },
                '403': errorResponse('Admin access required'),
            },
        },
    },
    '/generated-content/{id}': {
        patch: {
            tags: ['Generated Content'],
            summary: 'Approve or dismiss a generated content draft',
            security: bearerAuth,
            parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
            requestBody: {
                required: true,
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            required: ['status'],
                            properties: { status: { type: 'string', enum: ['approved', 'dismissed'] } },
                        },
                    },
                },
            },
            responses: {
                '200': {
                    description: 'Updated draft',
                    content: { 'application/json': { schema: singleEnvelope('GeneratedContentDoc') } },
                },
                '403': errorResponse('You do not have access to this team'),
                '404': errorResponse('Generated content not found'),
            },
        },
    },
};
