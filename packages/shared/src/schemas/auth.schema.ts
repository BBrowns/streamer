import { z } from 'zod';

/**
 * Password complexity requirement:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 */
const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit');

export const registerRequestSchema = z.object({
    email: z.string().email('Invalid email address').max(255, 'Email too long'),
    password: passwordSchema,
    displayName: z.string().min(1).max(50).optional(),
});

export const loginRequestSchema = z.object({
    email: z.string().email().max(255),
    password: z.string().min(1),
});

export const refreshRequestSchema = z.object({
    refreshToken: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
    email: z.string().email('Invalid email address').max(255),
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(50).optional(),
});
