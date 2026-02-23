import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../prisma/client.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../middleware/error.middleware.js';
import type { AuthTokens, UserProfile } from '@streamer/shared';

function generateTokens(userId: string, email: string): AuthTokens {
    const accessToken = jwt.sign(
        { userId, email },
        env.jwtSecret,
        { expiresIn: env.jwtAccessExpiry } as jwt.SignOptions,
    );

    const refreshToken = uuidv4();
    return { accessToken, refreshToken };
}

export class AuthService {
    async register(
        email: string,
        password: string,
        displayName?: string,
    ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            throw new AppError(409, 'Email already registered');
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const user = await prisma.user.create({
            data: { email, passwordHash, displayName },
        });

        const tokens = generateTokens(user.id, user.email);

        // Store refresh token
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: tokens.refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

        logger.info({ userId: user.id }, 'User registered');

        return {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName ?? undefined,
                createdAt: user.createdAt.toISOString(),
            },
            tokens,
        };
    }

    async login(
        email: string,
        password: string,
    ): Promise<{ user: UserProfile; tokens: AuthTokens }> {
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new AppError(401, 'Invalid email or password');
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            throw new AppError(401, 'Invalid email or password');
        }

        const tokens = generateTokens(user.id, user.email);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: tokens.refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

        logger.info({ userId: user.id }, 'User logged in');

        return {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName ?? undefined,
                createdAt: user.createdAt.toISOString(),
            },
            tokens,
        };
    }

    async refresh(refreshToken: string): Promise<AuthTokens> {
        const stored = await prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });

        if (!stored || stored.expiresAt < new Date()) {
            // Clean up expired token if it exists
            if (stored) {
                await prisma.refreshToken.delete({ where: { id: stored.id } });
            }
            throw new AppError(401, 'Invalid or expired refresh token');
        }

        // Rotate: delete old token, issue new pair
        await prisma.refreshToken.delete({ where: { id: stored.id } });

        const tokens = generateTokens(stored.user.id, stored.user.email);

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        await prisma.refreshToken.create({
            data: {
                token: tokens.refreshToken,
                userId: stored.user.id,
                expiresAt,
            },
        });

        logger.info({ userId: stored.user.id }, 'Token refreshed');

        return tokens;
    }
}

export const authService = new AuthService();
