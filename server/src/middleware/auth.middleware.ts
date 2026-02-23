import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface AuthPayload {
    userId: string;
    email: string;
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

export function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }

    const token = authHeader.slice(7);

    try {
        const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
        req.user = payload;
        next();
    } catch (err) {
        logger.warn({ requestId: req.requestId, err }, 'JWT verification failed');
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
