"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformPostValidation = void 0;
const zod_1 = require("zod");
const metricsValidation = zod_1.z.object({
    reach: zod_1.z.number().optional(),
    likes: zod_1.z.number().optional(),
    comments: zod_1.z.number().optional(),
    shares: zod_1.z.number().optional(),
    views: zod_1.z.number().optional(),
});
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const createPlatformPostValidation = zod_1.z.object({
    body: zod_1.z.object({
        team_id: objectId,
        platform: zod_1.z.string({ required_error: 'platform is required' }),
        post_id: zod_1.z.string({ required_error: 'post_id is required' }),
        content_snippet: zod_1.z.string().optional(),
        metrics: metricsValidation.optional(),
        published_at: zod_1.z.coerce.date().optional(),
        embedding: zod_1.z.array(zod_1.z.number()).length(1536).optional(),
    }),
});
const updatePlatformPostValidation = zod_1.z.object({
    body: zod_1.z.object({
        content_snippet: zod_1.z.string().optional(),
        metrics: metricsValidation.optional(),
        published_at: zod_1.z.coerce.date().optional(),
    }),
});
exports.PlatformPostValidation = {
    createPlatformPostValidation,
    updatePlatformPostValidation,
};
