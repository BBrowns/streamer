import { Request, Response, NextFunction } from 'express';
import { registerRequestSchema, loginRequestSchema, refreshRequestSchema } from '@streamer/shared';
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
}

export const authController = new AuthController();
