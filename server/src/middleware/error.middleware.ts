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

    // Fallback error handler
    logger.error(
        {
            err,
            requestId: (req as Request & { requestId: string }).requestId,
        },
        'Unhandled error',
    );

    if (err.name === 'PrismaClientKnownRequestError') {
        const prismaErr = err as any;
        if (prismaErr.code === 'P2003') {
            // Foreign key constraint failed - usually means user no longer exists but has a valid JWT
            res.status(401).json({
                error: 'Unauthorized or related record not found',
                requestId: (req as Request & { requestId: string }).requestId,
            });
            return;
        }
        if (prismaErr.code === 'P2025') {
            res.status(404).json({
                error: 'Record not found',
                requestId: (req as Request & { requestId: string }).requestId,
            });
            return;
        }
    }

    res.status(500).json({
        error: 'Internal server error',
        requestId: (req as Request & { requestId: string }).requestId,
    });
}
