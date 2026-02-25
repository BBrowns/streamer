import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Express middleware factory that validates request body against a Zod schema.
 * Rejects with 422 + detailed error messages if validation fails.
 *
 * Usage:
 *   router.post('/items', validateBody(mySchema), handler);
 */
export function validateBody(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                res.status(422).json({
                    error: 'Validation failed',
                    issues: err.issues.map((i) => ({
                        path: i.path.join('.'),
                        message: i.message,
                    })),
                });
                return;
            }
            next(err);
        }
    };
}

/**
 * Express middleware factory that validates request query parameters.
 *
 * Usage:
 *   router.get('/items', validateQuery(querySchema), handler);
 */
export function validateQuery(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            req.query = schema.parse(req.query);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                res.status(422).json({
                    error: 'Validation failed',
                    issues: err.issues.map((i) => ({
                        path: i.path.join('.'),
                        message: i.message,
                    })),
                });
                return;
            }
            next(err);
        }
    };
}

/**
 * Express middleware factory that validates route parameters.
 *
 * Usage:
 *   router.get('/items/:id', validateParams(paramSchema), handler);
 */
export function validateParams(schema: ZodSchema) {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            req.params = schema.parse(req.params);
            next();
        } catch (err) {
            if (err instanceof ZodError) {
                res.status(422).json({
                    error: 'Validation failed',
                    issues: err.issues.map((i) => ({
                        path: i.path.join('.'),
                        message: i.message,
                    })),
                });
                return;
            }
            next(err);
        }
    };
}
