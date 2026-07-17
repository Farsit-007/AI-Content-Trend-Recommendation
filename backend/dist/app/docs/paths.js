"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildResourcePaths = buildResourcePaths;
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Path builders for the standard CRUD resource shape:
 *   POST /            create
 *   GET  /            list (searchTerm, sort, page, limit + paginated envelope)
 *   GET  /{id}        read
 *   PATCH /{id}       update
 *   DELETE /{id}      delete
 *
 * Every operation declares the shared 404 / 500 error responses.
 */
const components_1 = require("./components");
const errorRef = { $ref: '#/components/schemas/ErrorEnvelope' };
const errorResponse = (description) => ({
    description,
    content: { 'application/json': { schema: errorRef } },
});
/** Success envelope wrapping a single resource in `data`. */
const singleEnvelope = (schemaName) => ({
    allOf: [
        { $ref: '#/components/schemas/SuccessEnvelope' },
        {
            type: 'object',
            properties: { data: { $ref: `#/components/schemas/${schemaName}` } },
        },
    ],
});
/** Success envelope wrapping an array of resources in `data`, with `meta`. */
const listEnvelope = (schemaName) => ({
    allOf: [
        { $ref: '#/components/schemas/SuccessEnvelope' },
        {
            type: 'object',
            properties: {
                meta: { $ref: '#/components/schemas/Meta' },
                data: {
                    type: 'array',
                    items: { $ref: `#/components/schemas/${schemaName}` },
                },
            },
        },
    ],
});
const jsonBody = (schemaName) => ({
    required: true,
    content: {
        'application/json': { schema: { $ref: `#/components/schemas/${schemaName}` } },
    },
});
const jsonResponse = (description, schema) => ({
    description,
    content: { 'application/json': { schema } },
});
/**
 * Returns the `paths` fragment for one resource mounted at `basePath`
 * (e.g. `/news-items`).
 */
function buildResourcePaths(basePath, opts) {
    const { singular, tag, schema } = opts;
    return {
        [basePath]: {
            post: {
                tags: [tag],
                summary: `Create a ${singular}`,
                requestBody: jsonBody(`${schema}Create`),
                responses: {
                    '201': jsonResponse(`${singular} created`, singleEnvelope(schema)),
                    '400': errorResponse('Validation error'),
                    '500': errorResponse('Server error'),
                },
            },
            get: {
                tags: [tag],
                summary: `List ${singular}s`,
                parameters: [...components_1.listQueryParameters],
                responses: {
                    '200': jsonResponse(`Paginated list of ${singular}s`, listEnvelope(schema)),
                    '500': errorResponse('Server error'),
                },
            },
        },
        [`${basePath}/{id}`]: {
            get: {
                tags: [tag],
                summary: `Get a ${singular} by id`,
                parameters: [components_1.idPathParameter],
                responses: {
                    '200': jsonResponse(`The requested ${singular}`, singleEnvelope(schema)),
                    '404': errorResponse(`${singular} not found`),
                    '500': errorResponse('Server error'),
                },
            },
            patch: {
                tags: [tag],
                summary: `Update a ${singular}`,
                parameters: [components_1.idPathParameter],
                requestBody: jsonBody(`${schema}Update`),
                responses: {
                    '200': jsonResponse(`Updated ${singular}`, singleEnvelope(schema)),
                    '400': errorResponse('Validation error'),
                    '404': errorResponse(`${singular} not found`),
                    '500': errorResponse('Server error'),
                },
            },
            delete: {
                tags: [tag],
                summary: `Delete a ${singular}`,
                parameters: [components_1.idPathParameter],
                responses: {
                    '200': jsonResponse(`Deleted ${singular}`, singleEnvelope(schema)),
                    '404': errorResponse(`${singular} not found`),
                    '500': errorResponse('Server error'),
                },
            },
        },
    };
}
