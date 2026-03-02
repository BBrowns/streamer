import type { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface AuthPayload {
    userId: string;
    email: string;
}

export async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
        return c.json({ error: 'Missing or invalid Authorization header' }, 401);
    }

    const token = authHeader.slice(7);

    try {
        const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
        c.set('user', payload);
        await next();
    } catch (err: any) {
        // TokenExpiredError is expected — the client will auto-refresh via /auth/refresh
        // Only log as WARN for genuinely unexpected JWT failures (bad signature, malformed, etc.)
        if (err?.name === 'TokenExpiredError') {
            logger.debug({ requestId: c.get('requestId') }, 'JWT expired — client should refresh');
        } else {
            logger.warn({ requestId: c.get('requestId'), err }, 'JWT verification failed');
        }
        return c.json({ error: 'Invalid or expired token' }, 401);
    }
}
