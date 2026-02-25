import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from server directory relative to __dirname
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Zod-validated environment configuration — no silent failures */
const envSchema = z.object({
    PORT: z.string().default('3001').transform(Number),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.string().default('info'),

    // Database
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // JWT
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_ACCESS_EXPIRY: z.string().default('15m'),
    JWT_REFRESH_EXPIRY: z.string().default('7d'),

    // CORS
    CORS_ORIGINS: z.string().default('http://localhost:8081'),

    // Aggregator
    ADDON_TIMEOUT_MS: z.string().default('5000').transform(Number),
    ADDON_MAX_CONCURRENT: z.string().default('10').transform(Number),

    // Debrid (optional)
    RD_API_TOKEN: z.string().optional(),

    // Trakt.tv (optional)
    TRAKT_CLIENT_ID: z.string().optional(),
    TRAKT_CLIENT_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error('❌ Invalid environment configuration:');
    console.error(parsed.error.format());
    process.exit(1);
}

const envData = parsed.data;

export const env = {
    port: envData.PORT,
    nodeEnv: envData.NODE_ENV,
    logLevel: envData.LOG_LEVEL,

    // Database
    databaseUrl: envData.DATABASE_URL,

    // JWT
    jwtSecret: envData.JWT_SECRET,
    jwtAccessExpiry: envData.JWT_ACCESS_EXPIRY,
    jwtRefreshExpiry: envData.JWT_REFRESH_EXPIRY,

    // CORS
    corsOrigins: envData.CORS_ORIGINS.split(','),

    // Aggregator
    addonTimeoutMs: envData.ADDON_TIMEOUT_MS,
    addonMaxConcurrent: envData.ADDON_MAX_CONCURRENT,

    // Debrid
    rdApiToken: envData.RD_API_TOKEN,

    // Trakt
    traktClientId: envData.TRAKT_CLIENT_ID,
    traktClientSecret: envData.TRAKT_CLIENT_SECRET,
} as const;
