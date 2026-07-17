"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentGenerationValidation = void 0;
const zod_1 = require("zod");
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const generateContentValidation = zod_1.z.object({
    body: zod_1.z.object({
        team_id: objectId,
        topic: zod_1.z.string({ required_error: 'topic is required' }).min(1, 'topic is required'),
        news_item_id: objectId.optional(),
        language: zod_1.z.enum(['bangla', 'english', 'banglish']).optional(),
    }),
});
exports.ContentGenerationValidation = {
    generateContentValidation,
};
