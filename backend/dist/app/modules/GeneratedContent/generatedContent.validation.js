"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeneratedContentValidation = void 0;
const zod_1 = require("zod");
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const listGeneratedContentValidation = zod_1.z.object({
    query: zod_1.z.object({
        team_id: objectId,
        status: zod_1.z.enum(['draft', 'approved', 'dismissed']).optional(),
        source: zod_1.z.enum(['auto', 'manual']).optional(),
        page: zod_1.z.string().optional(),
        limit: zod_1.z.string().optional(),
    }),
});
const updateGeneratedContentValidation = zod_1.z.object({
    params: zod_1.z.object({ id: objectId }),
    body: zod_1.z.object({
        status: zod_1.z.enum(['approved', 'dismissed'], {
            required_error: 'status is required',
            invalid_type_error: 'status must be "approved" or "dismissed"',
        }),
    }),
});
const triggerAutoGenerationValidation = zod_1.z.object({
    body: zod_1.z.object({
        team_id: objectId.optional(),
    }),
});
exports.GeneratedContentValidation = {
    listGeneratedContentValidation,
    updateGeneratedContentValidation,
    triggerAutoGenerationValidation,
};
