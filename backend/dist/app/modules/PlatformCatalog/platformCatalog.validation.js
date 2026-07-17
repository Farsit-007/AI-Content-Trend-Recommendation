"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformCatalogValidation = void 0;
const zod_1 = require("zod");
const platformSlug = zod_1.z
    .string({ required_error: 'name is required' })
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]+$/, 'name must contain only lowercase letters, numbers, hyphens, or underscores');
const createPlatformValidation = zod_1.z.object({
    body: zod_1.z.object({
        name: platformSlug,
        label: zod_1.z.string().optional(),
        is_enabled: zod_1.z.boolean().optional(),
    }),
});
exports.PlatformCatalogValidation = {
    createPlatformValidation,
};
