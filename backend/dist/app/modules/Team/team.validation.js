"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamValidation = void 0;
const zod_1 = require("zod");
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const createTeamValidation = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string({ required_error: 'name is required' }).min(1),
        description: zod_1.z.string().optional(),
        member_ids: zod_1.z.array(objectId).optional().default([]),
    }),
});
const updateTeamValidation = zod_1.z.object({
    body: zod_1.z.object({
        name: zod_1.z.string().min(1).optional(),
        description: zod_1.z.string().optional(),
        voice_profile: zod_1.z
            .object({
            default_language: zod_1.z.enum(['bangla', 'english', 'banglish']).default('bangla'),
            custom_instructions: zod_1.z.string().trim().max(500).optional(),
        })
            .optional(),
    }),
});
const addMemberValidation = zod_1.z.object({
    body: zod_1.z.object({
        user_id: objectId,
    }),
});
const addCategoryValidation = zod_1.z.object({
    body: zod_1.z.object({
        category: zod_1.z.string({ required_error: 'category is required' }).trim().min(1).max(40),
    }),
});
exports.TeamValidation = {
    createTeamValidation,
    updateTeamValidation,
    addMemberValidation,
    addCategoryValidation,
};
