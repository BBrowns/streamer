import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authRateLimiter } from '../../middleware/rateLimiter.middleware.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const authRouter = Router();

// Public routes (rate-limited)
authRouter.post('/register', authRateLimiter, (req, res, next) =>
    authController.register(req, res, next),
);

authRouter.post('/login', authRateLimiter, (req, res, next) =>
    authController.login(req, res, next),
);

authRouter.post('/refresh', authRateLimiter, (req, res, next) =>
    authController.refresh(req, res, next),
);

authRouter.post('/forgot-password', authRateLimiter, (req, res, next) =>
    authController.forgotPassword(req, res, next),
);

authRouter.post('/reset-password', authRateLimiter, (req, res, next) =>
    authController.resetPassword(req, res, next),
);

// Protected routes (require authentication)
authRouter.post('/change-password', authMiddleware, (req, res, next) =>
    authController.changePassword(req, res, next),
);

authRouter.patch('/profile', authMiddleware, (req, res, next) =>
    authController.updateProfile(req, res, next),
);
