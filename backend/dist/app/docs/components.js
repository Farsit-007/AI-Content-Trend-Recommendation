"use strict";
/**
 * Reusable OpenAPI component schemas and parameters shared across all resources.
 *
 * These mirror the runtime shapes produced by:
 *  - `sendResponse` (success envelope + `TMeta`)
 *  - `globalErrorHandler` (error envelope + `errorSource`)
 *  - `QueryBuilder` (list query parameters: searchTerm, sort, page, limit)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.idPathParameter = exports.listQueryParameters = exports.ErrorEnvelope = exports.SuccessEnvelope = exports.Meta = void 0;
exports.Meta = {
    type: 'object',
    description: 'Pagination metadata returned on list endpoints.',
    properties: {
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: 10 },
        total: { type: 'integer', example: 42 },
        totalPage: { type: 'integer', example: 5 },
    },
    required: ['page', 'limit', 'total', 'totalPage'],
};
/**
 * Base success envelope. Concrete responses compose this with a resource-specific
 * `data` schema via `allOf`.
 */
exports.SuccessEnvelope = {
    type: 'object',
    properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Operation successful' },
        meta: { $ref: '#/components/schemas/Meta' },
        data: {},
    },
    required: ['success', 'data'],
};
/**
 * Standard error envelope produced by the global error handler.
 */
exports.ErrorEnvelope = {
    type: 'object',
    properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Something went wrong!!' },
        errorSource: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    path: { type: 'string', example: '' },
                    message: { type: 'string', example: 'Something went wrong' },
                },
                required: ['path', 'message'],
            },
        },
        stack: {
            type: 'string',
            nullable: true,
            description: 'Error stack trace (present in non-production environments).',
        },
    },
    required: ['success', 'message', 'errorSource'],
};
/**
 * Shared list query parameters, backed by `QueryBuilder`.
 */
exports.listQueryParameters = [
    {
        name: 'searchTerm',
        in: 'query',
        required: false,
        description: 'Case-insensitive search across the resource searchable fields.',
        schema: { type: 'string' },
    },
    {
        name: 'sort',
        in: 'query',
        required: false,
        description: 'Sort expression, e.g. `-createdAt` (default) or `trend_score`.',
        schema: { type: 'string' },
    },
    {
        name: 'page',
        in: 'query',
        required: false,
        description: 'Page number (1-based). Defaults to 1.',
        schema: { type: 'integer', minimum: 1, default: 1 },
    },
    {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Items per page. Defaults to 10.',
        schema: { type: 'integer', minimum: 1, default: 10 },
    },
];
/** Reusable id path parameter. */
exports.idPathParameter = {
    name: 'id',
    in: 'path',
    required: true,
    description: 'MongoDB ObjectId of the resource.',
    schema: { type: 'string', example: '507f1f77bcf86cd799439011' },
};
