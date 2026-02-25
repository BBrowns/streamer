import { Router } from 'express';
import { aggregatorController } from './aggregator.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const aggregatorRouter = Router();

// All aggregator routes require authentication
aggregatorRouter.use(authMiddleware);

aggregatorRouter.get('/search', (req, res, next) =>
    aggregatorController.search(req, res, next),
);

aggregatorRouter.get('/catalog/:type', (req, res, next) =>
    aggregatorController.getCatalog(req, res, next),
);

aggregatorRouter.get('/meta/:type/:id', (req, res, next) =>
    aggregatorController.getMeta(req, res, next),
);

aggregatorRouter.get('/stream/:type/:id', (req, res, next) =>
    aggregatorController.getStreams(req, res, next),
);
