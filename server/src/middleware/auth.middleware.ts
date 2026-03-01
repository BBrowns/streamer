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
    } catch (err) {
        logger.warn({ requestId: c.get('requestId'), err }, 'JWT verification failed');
        return c.json({ error: 'Invalid or expired token' }, 401);
    }
}
