"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformCredentialValidation = void 0;
const zod_1 = require("zod");
const upsertCredentialValidation = zod_1.z.object({
    body: zod_1.z.object({
        // Any social platform slug (facebook, youtube, linkedin, reddit, twitter, instagram, tiktok, ...)
        // — lowercased, hyphen/underscore allowed, no fixed enum.
        platform: zod_1.z
            .string({ required_error: 'platform is required' })
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9_-]+$/, 'platform must contain only lowercase letters, numbers, hyphens, or underscores'),
        token: zod_1.z.string({ required_error: 'token is required' }).min(1),
        account_id: zod_1.z.string().optional(),
    }),
});
exports.PlatformCredentialValidation = {
    upsertCredentialValidation,
};
