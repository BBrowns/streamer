import dotenv from 'dotenv';
import path from 'path';

// Load .env from server directory
dotenv.config({ path: path.resolve(import.meta.dirname, '../../.env') });

export const env = {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',

    // Database
    databaseUrl: process.env.DATABASE_URL!,

    // JWT
    jwtSecret: process.env.JWT_SECRET!,
    jwtAccessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',

    // CORS
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:8081').split(','),

    // Aggregator
    addonTimeoutMs: parseInt(process.env.ADDON_TIMEOUT_MS || '5000', 10),
    addonMaxConcurrent: parseInt(process.env.ADDON_MAX_CONCURRENT || '10', 10),
} as const;
