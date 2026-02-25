import { Router } from 'express';
import { LibraryController } from './library.controller.js';
import { LibraryService } from '../domain/library.service.js';
import { PrismaLibraryRepository } from './prisma-library.repository.js';
import { PrismaWatchProgressRepository } from './prisma-progress.repository.js';
import { authMiddleware } from '../../../middleware/auth.middleware.js';

// Wire up Hexagonal Architecture: Ports → Adapters → Domain → Controller
const libraryRepo = new PrismaLibraryRepository();
const progressRepo = new PrismaWatchProgressRepository();
const libraryService = new LibraryService(libraryRepo, progressRepo);
const libraryController = new LibraryController(libraryService);

export const libraryRouter = Router();

// All library routes require authentication
libraryRouter.use(authMiddleware);

// Library / Watchlist
libraryRouter.get('/', (req, res, next) => libraryController.getLibrary(req, res, next));
libraryRouter.post('/', (req, res, next) => libraryController.addToLibrary(req, res, next));
libraryRouter.delete('/', (req, res, next) => libraryController.removeFromLibrary(req, res, next));
libraryRouter.get('/check/:itemId', (req, res, next) => libraryController.isInLibrary(req, res, next));

// Watch Progress / Continue Watching
libraryRouter.get('/progress', (req, res, next) => libraryController.getContinueWatching(req, res, next));
libraryRouter.post('/progress', (req, res, next) => libraryController.updateProgress(req, res, next));
