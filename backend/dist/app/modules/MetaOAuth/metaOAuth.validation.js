"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetaOAuthValidation = void 0;
const zod_1 = require("zod");
const connectValidation = zod_1.z.object({
    query: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
    }),
});
// Callback query is loose on purpose — Meta may send `error`/`error_reason` instead of code/state,
// and the handler maps every shape to a frontend redirect rather than a 4xx.
const callbackValidation = zod_1.z.object({
    query: zod_1.z.object({
        code: zod_1.z.string().optional(),
        state: zod_1.z.string().optional(),
        error: zod_1.z.string().optional(),
        error_reason: zod_1.z.string().optional(),
        error_description: zod_1.z.string().optional(),
    }),
});
const pagesValidation = zod_1.z.object({
    query: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
    }),
});
const selectPageValidation = zod_1.z.object({
    body: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
        pageId: zod_1.z.string({ required_error: 'pageId is required' }).min(1),
    }),
});
const disconnectValidation = zod_1.z.object({
    query: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
    }),
});
exports.MetaOAuthValidation = {
    connectValidation,
    callbackValidation,
    pagesValidation,
    selectPageValidation,
    disconnectValidation,
};
