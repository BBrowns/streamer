import type { Context, Next } from 'hono';

// Simple in-memory rate limiter for Hono
const hits = new Map<string, { count: number; resetAt: number }>();

function createRateLimiter(windowMs: number, max: number, message: string) {
    return async (c: Context, next: Next) => {
        if (process.env.NODE_ENV === 'test') {
            await next();
            return;
        }

        const ip = c.req.header('x-forwarded-for') || c.req.header('remote-addr') || 'unknown';
        const now = Date.now();
        const record = hits.get(ip);

        if (!record || now > record.resetAt) {
            hits.set(ip, { count: 1, resetAt: now + windowMs });
            await next();
            return;
        }

        if (record.count >= max) {
            return c.json({ error: message }, 429);
        }

        record.count++;
        await next();
    };
}

export const rateLimiter = createRateLimiter(15 * 60 * 1000, 100, 'Too many requests, please try again later');
export const authRateLimiter = createRateLimiter(15 * 60 * 1000, 20, 'Too many auth attempts, please try again later');
