import { Router } from 'express';
import { addonController } from './addon.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';

export const addonRouter = Router();

// All add-on routes require authentication
addonRouter.use(authMiddleware);

addonRouter.get('/', (req, res, next) => addonController.list(req, res, next));
addonRouter.post('/', (req, res, next) => addonController.install(req, res, next));
addonRouter.delete('/:id', (req, res, next) => addonController.uninstall(req, res, next));
