import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authRateLimiter } from '../../middleware/rateLimiter.middleware.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, (req, res, next) =>
    authController.register(req, res, next),
);

authRouter.post('/login', authRateLimiter, (req, res, next) =>
    authController.login(req, res, next),
);

authRouter.post('/refresh', authRateLimiter, (req, res, next) =>
    authController.refresh(req, res, next),
);
