import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'must be a valid MongoDB ObjectId');

const createUserValidation = z.object({
  body: z.object({
    email: z.string().email('A valid email is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1, 'Name is required'),
    role: z.enum(['super_admin', 'admin', 'user']).optional(),
    team_ids: z.array(objectId).optional(),
  }),
});

const loginValidation = z.object({
  body: z.object({
    email: z.string().email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
  }),
});

// Token usually arrives via the httpOnly cookie; body is the fallback for non-browser clients.
const refreshTokenValidation = z.object({
  body: z.object({
    refresh_token: z.string().min(1).optional(),
  }).optional(),
});

const changePasswordValidation = z.object({
  body: z.object({
    old_password: z.string().min(1, 'Current password is required'),
    new_password: z.string().min(8, 'New password must be at least 8 characters'),
  }),
});

const forgotPasswordValidation = z.object({
  body: z.object({
    email: z.string().email('A valid email is required'),
  }),
});

const resetPasswordValidation = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required'),
    new_password: z.string().min(8, 'New password must be at least 8 characters'),
  }),
});

export const UserValidation = {
  createUserValidation,
  loginValidation,
  refreshTokenValidation,
  changePasswordValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
};
