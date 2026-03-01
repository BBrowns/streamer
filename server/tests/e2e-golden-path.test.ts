import { describe, it, expect } from 'vitest';
import { request } from './test-utils.js';
import { createApp } from '../src/app';

/**
 * E2E Golden Path Test
 *
 * Tests the full user journey: Register → Login → Install Addon → Browse → Library
 * Runs against the Express app instance directly using supertest.
 * This ensures tests pass in CI without requiring the server to run on a port.
 */

const app = createApp();

describe('E2E Golden Path', () => {
    const testUser = {
        email: `e2e-${Date.now()}@test.com`,
        password: 'SecurePass123!',
        displayName: 'E2E Test User',
    };

    let accessToken: string;
    let refreshToken: string;
    let userId: string;

    it('Step 1: Register a new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser)
            .expect(201);

        expect(res.body).toHaveProperty('user');
        expect(res.body).toHaveProperty('tokens');
        expect(res.body.user.email).toBe(testUser.email);
        expect(res.body.user.displayName).toBe(testUser.displayName);

        accessToken = res.body.tokens.accessToken;
        refreshToken = res.body.tokens.refreshToken;
        userId = res.body.user.id;
    });

    it('Step 2: Login with the registered user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: testUser.email, password: testUser.password })
            .expect(200);

        expect(res.body.tokens.accessToken).toBeTruthy();
        accessToken = res.body.tokens.accessToken;
        refreshToken = res.body.tokens.refreshToken;
    });

    it('Step 3: Health check returns ok', async () => {
        const res = await request(app)
            .get('/health')
            .expect(200);

        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('timestamp');
    });

    it('Step 4: List addons (empty initially)', async () => {
        const res = await request(app)
            .get('/api/addons')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(res.body.addons).toBeInstanceOf(Array);
    });

    it('Step 5: Add item to library', async () => {
        const res = await request(app)
            .post('/api/library')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                type: 'movie',
                itemId: 'tt1234567',
                title: 'E2E Test Movie',
                poster: 'https://example.com/poster.jpg',
            })
            .expect(201);

        expect(res.body.itemId).toBe('tt1234567');
        expect(res.body.title).toBe('E2E Test Movie');
        expect(res.body.userId).toBe(userId);
    });

    it('Step 6: Verify item is in library', async () => {
        const res = await request(app)
            .get('/api/library/check/tt1234567')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(res.body.inLibrary).toBe(true);
    });

    it('Step 7: List library items', async () => {
        const res = await request(app)
            .get('/api/library')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(res.body.items).toBeInstanceOf(Array);
        expect(res.body.items.length).toBeGreaterThanOrEqual(1);
        expect(res.body.items.some((i: any) => i.itemId === 'tt1234567')).toBe(true);
    });

    it('Step 8: Report watch progress', async () => {
        const res = await request(app)
            .post('/api/library/progress')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                type: 'movie',
                itemId: 'tt1234567',
                currentTime: 1200,
                duration: 7200,
                title: 'E2E Test Movie',
                poster: 'https://example.com/poster.jpg',
            })
            .expect(200);

        expect(res.body.itemId).toBe('tt1234567');
        expect(res.body.currentTime).toBe(1200);
        expect(res.body.duration).toBe(7200);
    });

    it('Step 9: Get continue watching list', async () => {
        const res = await request(app)
            .get('/api/library/progress')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(res.body.items).toBeInstanceOf(Array);
        const movie = res.body.items.find((i: any) => i.itemId === 'tt1234567');
        expect(movie).toBeTruthy();
        expect(movie.currentTime).toBe(1200);
    });

    it('Step 10: Duplicate add should return 409', async () => {
        await request(app)
            .post('/api/library')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({
                type: 'movie',
                itemId: 'tt1234567',
                title: 'E2E Test Movie',
            })
            .expect(409);
    });

    it('Step 11: Remove item from library', async () => {
        await request(app)
            .delete('/api/library')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ itemId: 'tt1234567' })
            .expect(204);
    });

    it('Step 12: Verify item is no longer in library', async () => {
        const res = await request(app)
            .get('/api/library/check/tt1234567')
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(200);

        expect(res.body.inLibrary).toBe(false);
    });

    it('Step 13: Refresh token', async () => {
        const res = await request(app)
            .post('/api/auth/refresh')
            .send({ refreshToken })
            .expect(200);

        expect(res.body.accessToken).toBeTruthy();
        expect(res.body.refreshToken).toBeTruthy();
    });

    it('Step 14: Protected routes reject invalid tokens', async () => {
        await request(app)
            .get('/api/library')
            .set('Authorization', 'Bearer invalid-token')
            .expect(401);
    });

    it('Step 15: Validation rejects malformed body', async () => {
        const res = await request(app)
            .post('/api/library')
            .set('Authorization', `Bearer ${accessToken}`)
            .send({ type: 'invalid-type' }); // Missing required fields

        // Should return 400 or 422 (Zod validation)
        expect([400, 422]).toContain(res.status);
    });
});
