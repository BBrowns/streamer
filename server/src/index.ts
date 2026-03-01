import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './prisma/client.js';

async function main() {
    // Verify database connection
    try {
        await prisma.$connect();
        logger.info('Database connected');
    } catch (err) {
        logger.fatal({ err }, 'Failed to connect to database');
        process.exit(1);
    }

    const app = createApp();

    serve({
        fetch: app.fetch,
        port: env.port
    }, (info) => {
        logger.info(
            { port: info.port, env: env.nodeEnv },
            `Streamer server running on port ${info.port}`,
        );
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info({ signal }, 'Shutting down gracefully...');
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
    logger.fatal({ err }, 'Unhandled startup error');
    process.exit(1);
});
