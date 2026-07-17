"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentGenerationPaths = void 0;
/**
 * Hand-written path for POST /content/generate — a single RAG-grounded generation
 * endpoint, not a CRUD resource, so it doesn't fit `buildResourcePaths` (paths.ts).
 */
const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description) => ({
    description,
    content: { 'application/json': { schema: errorRef } },
});
const singleEnvelope = (schemaName) => ({
    allOf: [
        { $ref: '#/components/schemas/SuccessEnvelope' },
        { type: 'object', properties: { data: { $ref: `#/components/schemas/${schemaName}` } } },
    ],
});
const jsonBody = (schemaName) => ({
    required: true,
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } } },
});
const bearerAuth = [{ bearerAuth: [] }];
exports.contentGenerationPaths = {
    '/content/generate': {
        post: {
            tags: ['Content Generation'],
            summary: "Generate multi-format content grounded in the team's own brand voice",
            security: bearerAuth,
            requestBody: jsonBody('GenerateContentRequest'),
            responses: {
                '200': {
                    description: 'Generated content',
                    content: { 'application/json': { schema: singleEnvelope('GeneratedContent') } },
                },
                '400': errorResponse('Validation error'),
                '403': errorResponse('You do not have access to this team'),
                '502': errorResponse('Content generation failed — the LLM call or its response was invalid'),
            },
        },
    },
};
