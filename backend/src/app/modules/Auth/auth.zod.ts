import { z } from 'zod'

export const loginValidationSchema = z.object({
    body: z.object({
        email: z.string({ required_error: 'Email is required' }),
        password: z.string({ required_error: 'Password is required' }),
    }),
})

export const changePasswordValidationSchema = z.object({
    body: z.object({
        oldPassword: z.string({ required_error: 'Old password is required' }),
        newPassword: z.string({ required_error: 'Password is required' }),
    }),
})

export const refreshTokenValidation = z.object({
    cookies: z.object({
        refreshToken: z.string({
            required_error: 'Refresh token is required',
        }),
    }),
})
