import { Request, Response, NextFunction } from 'express';
import { aggregatorService } from './aggregator.service.js';

export class AggregatorController {
    async getCatalog(req: Request, res: Response, next: NextFunction) {
        try {
            const { type } = req.params;
            const search = req.query.search as string | undefined;
            const skip = req.query.skip ? parseInt(req.query.skip as string, 10) : undefined;

            const metas = await aggregatorService.getCatalog(
                req.user!.userId,
                type,
                req.requestId,
                search,
                skip,
            );

            res.json({ metas });
        } catch (err) {
            next(err);
        }
    }

    async getMeta(req: Request, res: Response, next: NextFunction) {
        try {
            const { type, id } = req.params;
            const meta = await aggregatorService.getMeta(
                req.user!.userId,
                type,
                id,
                req.requestId,
            );

            if (!meta) {
                res.status(404).json({ error: 'Metadata not found' });
                return;
            }

            res.json({ meta });
        } catch (err) {
            next(err);
        }
    }

    async getStreams(req: Request, res: Response, next: NextFunction) {
        try {
            const { type, id } = req.params;
            const streams = await aggregatorService.getStreams(
                req.user!.userId,
                type,
                id,
                req.requestId,
            );

            res.json({ streams });
        } catch (err) {
            next(err);
        }
    }
}

export const aggregatorController = new AggregatorController();
