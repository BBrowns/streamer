import type { Context } from 'hono';
import {
    registerRequestSchema,
    loginRequestSchema,
    refreshRequestSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    changePasswordSchema,
    updateProfileSchema,
} from '@streamer/shared';
import { authService } from './auth.service.js';

export class AuthController {
    async register(c: Context) {
        const body = await c.req.json();
        const data = registerRequestSchema.parse(body);
        const result = await authService.register(
            data.email,
            data.password,
            data.displayName,
        );
        return c.json(result, 201);
    }

    async login(c: Context) {
        const body = await c.req.json();
        const data = loginRequestSchema.parse(body);
        const result = await authService.login(data.email, data.password);
        return c.json(result);
    }

    async refresh(c: Context) {
        const body = await c.req.json();
        const data = refreshRequestSchema.parse(body);
        const tokens = await authService.refresh(data.refreshToken);
        return c.json(tokens);
    }

    async forgotPassword(c: Context) {
        const body = await c.req.json();
        const data = forgotPasswordSchema.parse(body);
        const result = await authService.forgotPassword(data.email);

        return c.json({
            message: 'If an account with that email exists, a reset token has been generated.',
            ...(process.env.NODE_ENV !== 'production' && result.resetToken
                ? { resetToken: result.resetToken }
                : {}),
        });
    }

    async resetPassword(c: Context) {
        const body = await c.req.json();
        const data = resetPasswordSchema.parse(body);
        await authService.resetPassword(data.token, data.newPassword);
        return c.json({ message: 'Password reset successfully. Please log in.' });
    }

    async changePassword(c: Context) {
        const body = await c.req.json();
        const data = changePasswordSchema.parse(body);
        const user = c.get('user') as any;
        await authService.changePassword(
            user.userId,
            data.currentPassword,
            data.newPassword,
        );
        return c.json({ message: 'Password changed successfully' });
    }

    async updateProfile(c: Context) {
        const body = await c.req.json();
        const data = updateProfileSchema.parse(body);
        const user = c.get('user') as any;
        const updatedUser = await authService.updateProfile(user.userId, data);
        return c.json({ user: updatedUser });
    }
}

export const authController = new AuthController();
