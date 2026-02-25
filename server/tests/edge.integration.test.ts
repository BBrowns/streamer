import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';
import { errorMiddleware, AppError } from '../src/middleware/error.middleware.js';
import { z } from 'zod';

describe('Error Handling & Edge Cases', () => {
    let app: express.Express;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Dummy endpoint to throw AppError
        app.get('/app-error', () => {
            throw new AppError(403, 'Forbidden action');
        });

        // Dummy endpoint to throw ZodError
        app.post('/zod-error', (req) => {
            z.object({ name: z.string() }).parse(req.body);
        });

        // Dummy endpoint to simulate unhandled error (e.g. DB connection failed)
        app.get('/fatal-error', () => {
            throw new Error('Database connection lost');
        });

        // Dummy endpoint for rate limiting
        const limiter = rateLimit({
            windowMs: 1000, // 1 second
            limit: 2, // limit each IP to 2 requests per windowMs
            message: { error: 'Too many requests' },
            standardHeaders: 'draft-7',
            legacyHeaders: false,
        });

        app.get('/rate-limit', limiter, (req, res) => {
            res.send('ok');
        });

        // Invalid JSON body is handled by express.json() natively but we can test it
        // We need to attach the error middleware at the end
        app.use(errorMiddleware);
    });

    it('should handle AppError correctly', async () => {
        const res = await request(app).get('/app-error');
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('Forbidden action');
    });

    it('should handle ZodError correctly', async () => {
        const res = await request(app).post('/zod-error').send({ age: 25 });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Validation failed');
        expect(res.body.details).toBeDefined();
        expect(res.body.details[0].message).toContain('Required');
    });

    it('should handle unhandled/fatal errors correctly', async () => {
        // Suppress console.error in this exact test since we expect an internal 500
        const stdErr = vi.spyOn(console, 'error').mockImplementation(() => { });

        const res = await request(app).get('/fatal-error');
        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Internal server error');

        stdErr.mockRestore();
    });

    it('should handle invalid JSON bodies', async () => {
        // express.json() throws a SyntaxError on bad JSON before reaching our endpoints
        const res = await request(app)
            .post('/zod-error')
            .set('Content-Type', 'application/json')
            .send('{"name": "test", bad json}'); // Malformed

        // Express default error handler sends 400 for SyntaxError in body parser
        expect(res.status).toBe(400);
    });

    it('should handle rate limiting functionality', async () => {
        // Send 2 allowed requests
        await request(app).get('/rate-limit').expect(200);
        await request(app).get('/rate-limit').expect(200);

        // 3rd request should hit the rate limiter 429
        const res = await request(app).get('/rate-limit');
        expect(res.status).toBe(429);
        expect(res.body.error).toBe('Too many requests');
    });
});
