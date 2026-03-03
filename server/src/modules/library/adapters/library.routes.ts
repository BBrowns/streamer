import { Hono } from "hono";
import { LibraryController } from "./library.controller.js";
import { LibraryService } from "../domain/library.service.js";
import { PrismaLibraryRepository } from "./prisma-library.repository.js";
import { PrismaWatchProgressRepository } from "./prisma-progress.repository.js";
import { authMiddleware } from "../../../middleware/auth.middleware.js";

// Wire up Hexagonal Architecture: Ports → Adapters → Domain → Controller
const libraryRepo = new PrismaLibraryRepository();
const progressRepo = new PrismaWatchProgressRepository();
const libraryService = new LibraryService(libraryRepo, progressRepo);
const libraryController = new LibraryController(libraryService);

export const libraryRouter = new Hono();

// All library routes require authentication
libraryRouter.use("*", authMiddleware);

// Library / Watchlist
libraryRouter.get("/", (c) => libraryController.getLibrary(c));
libraryRouter.post("/", (c) => libraryController.addToLibrary(c));
libraryRouter.delete("/", (c) => libraryController.removeFromLibrary(c));
libraryRouter.get("/check/:itemId", (c) => libraryController.isInLibrary(c));

// Watch Progress / Continue Watching
libraryRouter.get("/progress", (c) => libraryController.getContinueWatching(c));
libraryRouter.post("/progress", (c) => libraryController.updateProgress(c));
