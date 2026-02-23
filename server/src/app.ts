import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { corsOptions } from './config/cors.js';
import { logger } from './config/logger.js';
import { requestIdMiddleware } from './middleware/requestId.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { rateLimiter } from './middleware/rateLimiter.middleware.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { addonRouter } from './modules/addon/addon.routes.js';
import { aggregatorRouter } from './modules/aggregator/aggregator.routes.js';

export function createApp() {
    const app = express();

    // Global middleware
    app.use(helmet());
    app.use(cors(corsOptions));
    app.use(express.json({ limit: '1mb' }));
    app.use(requestIdMiddleware);
    app.use(
        pinoHttp({
            logger,
            customProps: (req: any) => ({ requestId: req.requestId }),
        }),
    );
    app.use(rateLimiter);

    // Health check
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // API routes
    app.use('/api/auth', authRouter);
    app.use('/api/addons', addonRouter);
    app.use('/api', aggregatorRouter);

    // Error handler (must be last)
    app.use(errorMiddleware);

    return app;
}
