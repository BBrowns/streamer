import { z } from 'zod';

export const registerRequestSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    displayName: z.string().min(1).max(50).optional(),
});

export const loginRequestSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

export const refreshRequestSchema = z.object({
    refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(50).optional(),
});
