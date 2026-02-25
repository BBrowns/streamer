import { Request, Response, NextFunction } from 'express';
import { addToLibrarySchema, updateProgressSchema, removeFromLibrarySchema } from '@streamer/shared';
import type { LibraryService } from '../domain/library.service.js';

export class LibraryController {
    constructor(private readonly service: LibraryService) { }

    async addToLibrary(req: Request, res: Response, next: NextFunction) {
        try {
            const data = addToLibrarySchema.parse(req.body);
            const item = await this.service.addToLibrary(req.user!.userId, data);
            res.status(201).json(item);
        } catch (err) {
            next(err);
        }
    }

    async removeFromLibrary(req: Request, res: Response, next: NextFunction) {
        try {
            const { itemId } = removeFromLibrarySchema.parse(req.body);
            await this.service.removeFromLibrary(req.user!.userId, itemId);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }

    async getLibrary(req: Request, res: Response, next: NextFunction) {
        try {
            const items = await this.service.getLibrary(req.user!.userId);
            res.json({ items });
        } catch (err) {
            next(err);
        }
    }

    async isInLibrary(req: Request, res: Response, next: NextFunction) {
        try {
            const itemId = req.params.itemId as string;
            const inLibrary = await this.service.isInLibrary(req.user!.userId, itemId);
            res.json({ inLibrary });
        } catch (err) {
            next(err);
        }
    }

    async updateProgress(req: Request, res: Response, next: NextFunction) {
        try {
            const data = updateProgressSchema.parse(req.body);
            const progress = await this.service.updateProgress(req.user!.userId, data);
            res.json(progress);
        } catch (err) {
            next(err);
        }
    }

    async getContinueWatching(req: Request, res: Response, next: NextFunction) {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
            const items = await this.service.getContinueWatching(req.user!.userId, limit);
            res.json({ items });
        } catch (err) {
            next(err);
        }
    }
}
