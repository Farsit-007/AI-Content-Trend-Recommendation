"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserValidation = void 0;
const zod_1 = require("zod");
const objectId = zod_1.z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');
const createUserValidation = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('A valid email is required'),
        password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
        name: zod_1.z.string().min(1, 'Name is required'),
        role: zod_1.z.enum(['super_admin', 'admin', 'user']).optional(),
        team_ids: zod_1.z.array(objectId).optional(),
    }),
});
const loginValidation = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('A valid email is required'),
        password: zod_1.z.string().min(1, 'Password is required'),
    }),
});
// Token usually arrives via the httpOnly cookie; body is the fallback for non-browser clients.
const refreshTokenValidation = zod_1.z.object({
    body: zod_1.z.object({
        refresh_token: zod_1.z.string().min(1).optional(),
    }).optional(),
});
const changePasswordValidation = zod_1.z.object({
    body: zod_1.z.object({
        old_password: zod_1.z.string().min(1, 'Current password is required'),
        new_password: zod_1.z.string().min(8, 'New password must be at least 8 characters'),
    }),
});
const forgotPasswordValidation = zod_1.z.object({
    body: zod_1.z.object({
        email: zod_1.z.string().email('A valid email is required'),
    }),
});
const resetPasswordValidation = zod_1.z.object({
    body: zod_1.z.object({
        token: zod_1.z.string().min(1, 'Reset token is required'),
        new_password: zod_1.z.string().min(8, 'New password must be at least 8 characters'),
    }),
});
exports.UserValidation = {
    createUserValidation,
    loginValidation,
    refreshTokenValidation,
    changePasswordValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
};
