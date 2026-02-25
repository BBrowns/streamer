import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export class AppError extends Error {
    constructor(
        public statusCode: number,
        message: string,
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export function errorMiddleware(
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
): void {
    const requestId = req.requestId || 'unknown';

    if (err instanceof AppError) {
        logger.warn(
            { requestId, statusCode: err.statusCode, error: err.message },
            'Application error',
        );
        res.status(err.statusCode).json({
            error: err.message,
            requestId,
        });
        return;
    }

    if (err instanceof ZodError) {
        logger.warn(
            { requestId, issues: err.issues },
            'Validation error',
        );
        res.status(400).json({
            error: 'Validation failed',
            details: err.issues.map((i) => ({
                path: i.path.join('.'),
                message: i.message,
            })),
            requestId,
        });
        return;
    }

    // Handle malformed JSON from express.json() body parser
    if (err instanceof SyntaxError && 'body' in err) {
        logger.warn({ requestId, error: err.message }, 'Malformed JSON request');
        res.status(400).json({
            error: 'Invalid JSON payload',
            requestId,
        });
        return;
    }

    logger.error(
        { requestId, error: err.message, stack: err.stack },
        'Unhandled server error',
    );
    res.status(500).json({
        error: 'Internal server error',
        requestId,
    });
}
