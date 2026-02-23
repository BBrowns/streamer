import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { addonService } from './addon.service.js';

const installSchema = z.object({
    transportUrl: z.string().url('Must be a valid URL'),
});

export class AddonController {
    async install(req: Request, res: Response, next: NextFunction) {
        try {
            const { transportUrl } = installSchema.parse(req.body);
            const addon = await addonService.install(req.user!.userId, transportUrl);
            res.status(201).json(addon);
        } catch (err) {
            next(err);
        }
    }

    async list(req: Request, res: Response, next: NextFunction) {
        try {
            const addons = await addonService.list(req.user!.userId);
            res.json({ addons });
        } catch (err) {
            next(err);
        }
    }

    async uninstall(req: Request, res: Response, next: NextFunction) {
        try {
            await addonService.uninstall(req.user!.userId, req.params.id);
            res.status(204).send();
        } catch (err) {
            next(err);
        }
    }
}

export const addonController = new AddonController();
