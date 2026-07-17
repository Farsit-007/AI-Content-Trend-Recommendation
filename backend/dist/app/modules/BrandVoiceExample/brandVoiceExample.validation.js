"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrandVoiceExampleValidation = void 0;
const zod_1 = require("zod");
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const createBrandVoiceExampleValidation = zod_1.z.object({
    body: zod_1.z.object({
        team_id: objectId,
        platform: zod_1.z.string({ required_error: 'platform is required' }),
        category: zod_1.z.string().optional(),
        content: zod_1.z.string({ required_error: 'content is required' }),
        engagement_hint: zod_1.z.string().optional(),
        added_by: zod_1.z.string().optional(),
        embedding: zod_1.z.array(zod_1.z.number()).length(1536).optional(),
    }),
});
const updateBrandVoiceExampleValidation = zod_1.z.object({
    body: zod_1.z.object({
        platform: zod_1.z.string().optional(),
        category: zod_1.z.string().optional(),
        content: zod_1.z.string().optional(),
        engagement_hint: zod_1.z.string().optional(),
        added_by: zod_1.z.string().optional(),
    }),
});
exports.BrandVoiceExampleValidation = {
    createBrandVoiceExampleValidation,
    updateBrandVoiceExampleValidation,
};
