"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsItemValidation = void 0;
const zod_1 = require("zod");
const engagementValidation = zod_1.z.object({
    points: zod_1.z.number().optional(),
    comments: zod_1.z.number().optional(),
    stars_delta: zod_1.z.number().optional(),
});
const contentStatusValidation = zod_1.z.enum(['none', 'partial', 'full', 'failed']);
const createNewsItemValidation = zod_1.z.object({
    body: zod_1.z.object({
        source: zod_1.z.string({ required_error: 'source is required' }),
        source_id: zod_1.z.string({ required_error: 'source_id is required' }),
        content_hash: zod_1.z.string({ required_error: 'content_hash is required' }),
        title: zod_1.z.string({ required_error: 'title is required' }),
        url: zod_1.z.string({ required_error: 'url is required' }).url(),
        snippet: zod_1.z.string().optional(),
        content: zod_1.z.string().optional(),
        content_status: contentStatusValidation.optional(),
        word_count: zod_1.z.number().int().nonnegative().optional(),
        published_at: zod_1.z.coerce.date().optional(),
        engagement: engagementValidation.optional(),
        category: zod_1.z.string().optional(),
        embedding: zod_1.z.array(zod_1.z.number()).length(1536).optional(),
    }),
});
const getAllNewsItemsValidation = zod_1.z.object({
    query: zod_1.z.object({
        team_id: zod_1.z.string().optional(),
        search: zod_1.z.string().optional(),
        category: zod_1.z.string().optional(),
        sort: zod_1.z.string().optional(),
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
    }),
});
const updateNewsItemValidation = zod_1.z.object({
    body: zod_1.z.object({
        title: zod_1.z.string().optional(),
        url: zod_1.z.string().url().optional(),
        snippet: zod_1.z.string().optional(),
        content: zod_1.z.string().optional(),
        content_status: contentStatusValidation.optional(),
        word_count: zod_1.z.number().int().nonnegative().optional(),
        published_at: zod_1.z.coerce.date().optional(),
        engagement: engagementValidation.optional(),
        trend_score: zod_1.z.number().optional(),
        category: zod_1.z.string().optional(),
        relevance_score: zod_1.z.number().optional(),
        impact_note: zod_1.z.string().optional(),
        opportunity_score: zod_1.z.number().optional(),
        processed: zod_1.z.boolean().optional(),
    }),
});
exports.NewsItemValidation = {
    createNewsItemValidation,
    getAllNewsItemsValidation,
    updateNewsItemValidation,
};
