"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatPaths = void 0;
/**
 * Hand-written path for POST /chat — a single conversational Q&A endpoint, not a
 * CRUD resource, so it doesn't fit `buildResourcePaths` (paths.ts).
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
exports.chatPaths = {
    '/chat': {
        post: {
            tags: ['Chat'],
            summary: "Ask Growth Studio a question, grounded in the team's news and performance data",
            security: bearerAuth,
            requestBody: jsonBody('AskChatRequest'),
            responses: {
                '200': {
                    description: 'Chat reply',
                    content: { 'application/json': { schema: singleEnvelope('AskChatResponse') } },
                },
                '400': errorResponse('Validation error'),
                '403': errorResponse('You do not have access to this team'),
                '502': errorResponse('Chat request failed — the LLM call failed'),
            },
        },
    },
};
