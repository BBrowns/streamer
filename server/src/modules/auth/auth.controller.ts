import { Request, Response, NextFunction } from 'express';
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
    async register(req: Request, res: Response, next: NextFunction) {
        try {
            const data = registerRequestSchema.parse(req.body);
            const result = await authService.register(
                data.email,
                data.password,
                data.displayName,
            );
            res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const data = loginRequestSchema.parse(req.body);
            const result = await authService.login(data.email, data.password);
            res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            const data = refreshRequestSchema.parse(req.body);
            const tokens = await authService.refresh(data.refreshToken);
            res.json(tokens);
        } catch (err) {
            next(err);
        }
    }

    async forgotPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const data = forgotPasswordSchema.parse(req.body);
            const result = await authService.forgotPassword(data.email);

            // Always return 200 to prevent email enumeration
            res.json({
                message: 'If an account with that email exists, a reset token has been generated.',
                // In dev/staging, include the token for testing
                ...(process.env.NODE_ENV !== 'production' && result.resetToken
                    ? { resetToken: result.resetToken }
                    : {}),
            });
        } catch (err) {
            next(err);
        }
    }

    async resetPassword(req: Request, res: Response, next: NextFunction) {
        try {
            const data = resetPasswordSchema.parse(req.body);
            await authService.resetPassword(data.token, data.newPassword);
            res.json({ message: 'Password reset successfully. Please log in.' });
        } catch (err) {
            next(err);
        }
    }

    async changePassword(req: Request, res: Response, next: NextFunction) {
        try {
            const data = changePasswordSchema.parse(req.body);
            await authService.changePassword(
                req.user!.userId,
                data.currentPassword,
                data.newPassword,
            );
            res.json({ message: 'Password changed successfully' });
        } catch (err) {
            next(err);
        }
    }

    async updateProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const data = updateProfileSchema.parse(req.body);
            const user = await authService.updateProfile(req.user!.userId, data);
            res.json({ user });
        } catch (err) {
            next(err);
        }
    }
}

export const authController = new AuthController();
