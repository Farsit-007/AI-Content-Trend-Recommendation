"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkedInOAuthValidation = void 0;
const zod_1 = require("zod");
const connectValidation = zod_1.z.object({
    query: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
    }),
});
// Callback query is loose on purpose — LinkedIn may send `error`/`error_description` instead of
// code/state, and the handler maps every shape to a frontend redirect rather than a 4xx.
const callbackValidation = zod_1.z.object({
    query: zod_1.z.object({
        code: zod_1.z.string().optional(),
        state: zod_1.z.string().optional(),
        error: zod_1.z.string().optional(),
        error_description: zod_1.z.string().optional(),
    }),
});
const orgsValidation = zod_1.z.object({
    query: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
    }),
});
const selectOrgValidation = zod_1.z.object({
    body: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
        orgId: zod_1.z.string({ required_error: 'orgId is required' }).min(1),
    }),
});
const disconnectValidation = zod_1.z.object({
    query: zod_1.z.object({
        teamId: zod_1.z.string({ required_error: 'teamId is required' }).min(1),
    }),
});
exports.LinkedInOAuthValidation = {
    connectValidation,
    callbackValidation,
    orgsValidation,
    selectOrgValidation,
    disconnectValidation,
};
