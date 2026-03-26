import { ContentType } from "@prisma/client";
import { logger } from "../../../config/logger.js";
import { AppError } from "../../../middleware/error.middleware.js";
import type {
  ILibraryRepository,
  IWatchProgressRepository,
  LibraryItemRecord,
  WatchProgressRecord,
} from "../ports/library.ports.js";
import type { LibraryItem, WatchProgress } from "@streamer/shared";

export class LibraryService {
  constructor(
    private readonly libraryRepo: ILibraryRepository,
    private readonly progressRepo: IWatchProgressRepository,
  ) {}

  /** Add an item to the user's library / watchlist */
  async addToLibrary(
    userId: string,
    data: { type: string; itemId: string; title: string; poster?: string },
  ): Promise<LibraryItem> {
    const existing = await this.libraryRepo.findByUserAndItem(
      userId,
      data.itemId,
    );
    if (existing) {
      throw new AppError(409, "Item already in library");
    }

    const record = await this.libraryRepo.create({
      userId,
      type: data.type as ContentType,
      itemId: data.itemId,
      title: data.title,
      poster: data.poster ?? null,
    });

    logger.info({ userId, itemId: data.itemId }, "Item added to library");
    return this.toLibraryItem(record);
  }

  /** Remove an item from the library */
  async removeFromLibrary(userId: string, itemId: string): Promise<void> {
    const existing = await this.libraryRepo.findByUserAndItem(userId, itemId);
    if (!existing) {
      throw new AppError(404, "Item not found in library");
    }

    await this.libraryRepo.delete(userId, itemId);
    logger.info({ userId, itemId }, "Item removed from library");
  }

  /** Get all library items for a user */
  async getLibrary(userId: string): Promise<LibraryItem[]> {
    const records = await this.libraryRepo.findByUser(userId);
    return records.map((r) => this.toLibraryItem(r));
  }

  /** Check if an item is in the user's library */
  async isInLibrary(userId: string, itemId: string): Promise<boolean> {
    const record = await this.libraryRepo.findByUserAndItem(userId, itemId);
    return record !== null;
  }

  /** Update/report watch progress */
  async updateProgress(
    userId: string,
    data: {
      type: string;
      itemId: string;
      season?: number;
      episode?: number;
      currentTime: number;
      duration: number;
      title: string;
      poster?: string;
    },
  ): Promise<WatchProgress> {
    const record = await this.progressRepo.upsert({
      userId,
      type: data.type as ContentType,
      itemId: data.itemId,
      season: data.season ?? null,
      episode: data.episode ?? null,
      currentTime: data.currentTime,
      duration: data.duration,
      title: data.title,
      poster: data.poster ?? null,
    });

    logger.debug({ userId, itemId: data.itemId }, "Watch progress updated");
    return this.toWatchProgress(record);
  }

  /** Get continue-watching list (recently watched, not completed) */
  async getContinueWatching(
    userId: string,
    limit = 20,
  ): Promise<WatchProgress[]> {
    const records = await this.progressRepo.findByUser(userId, limit);

    // Filter out completed items (>= 95% watched)
    const inProgress = records.filter((r) => {
      if (r.duration <= 0) return false;
      const pct = r.currentTime / r.duration;
      return pct < 0.95;
    });

    return inProgress.map((r) => this.toWatchProgress(r));
  }

  private toLibraryItem(record: LibraryItemRecord): LibraryItem {
    return {
      id: record.id,
      userId: record.userId,
      type: record.type as "movie" | "series",
      itemId: record.itemId,
      title: record.title,
      poster: record.poster,
      addedAt: record.addedAt.toISOString(),
    };
  }

  private toWatchProgress(record: WatchProgressRecord): WatchProgress {
    return {
      id: record.id,
      userId: record.userId,
      type: record.type as "movie" | "series",
      itemId: record.itemId,
      season: record.season,
      episode: record.episode,
      currentTime: record.currentTime,
      duration: record.duration,
      title: record.title,
      poster: record.poster,
      lastWatched: record.lastWatched.toISOString(),
    };
  }
}
