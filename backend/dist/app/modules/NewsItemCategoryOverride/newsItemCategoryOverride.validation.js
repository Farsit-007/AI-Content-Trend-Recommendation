"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NewsItemCategoryOverrideValidation = void 0;
const zod_1 = require("zod");
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const setOverrideValidation = zod_1.z.object({
    body: zod_1.z
        .object({
        team_id: objectId,
        category: zod_1.z.string().min(1).optional(),
        opportunity_score: zod_1.z.number().min(0).max(10).optional(),
    })
        .refine((data) => data.category !== undefined || data.opportunity_score !== undefined, {
        message: 'At least one of category or opportunity_score must be provided',
    }),
});
const clearOverrideValidation = zod_1.z.object({
    body: zod_1.z.object({
        team_id: objectId,
    }),
});
exports.NewsItemCategoryOverrideValidation = {
    setOverrideValidation,
    clearOverrideValidation,
};
