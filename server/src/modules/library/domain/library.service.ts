import { ContentType } from "@prisma/client";
import { logger } from "../../../config/logger.js";
import { AppError } from "../../../middleware/error.middleware.js";
import type {
  ILibraryRepository,
  IWatchProgressRepository,
  LibraryItemRecord,
  WatchProgressRecord,
} from "../ports/library.ports.js";
import type {
  LibraryItem,
  WatchHistoryPage,
  WatchProgress,
  WatchProgressDurationSource,
} from "@streamer/shared";

import { TraktService } from "../../trakt/trakt.service.js";
import { syncService } from "../../sync/sync.service.js";
import { NotificationService } from "../../notification/notification.service.js";

export class LibraryService {
  constructor(
    private readonly libraryRepo: ILibraryRepository,
    private readonly progressRepo: IWatchProgressRepository,
    private readonly traktService: TraktService,
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

    // Create notification in background
    NotificationService.createNotification(
      userId,
      "Added to Library",
      `"${data.title}" has been added to your library.`,
    ).catch((err) =>
      logger.warn({ err }, "Failed to create library notification"),
    );

    const result = this.toLibraryItem(record);
    syncService.broadcast(userId, "LIBRARY_UPDATE", {
      action: "add",
      item: result,
    });
    return result;
  }

  /** Remove an item from the library */
  async removeFromLibrary(userId: string, itemId: string): Promise<void> {
    const existing = await this.libraryRepo.findByUserAndItem(userId, itemId);
    if (!existing) {
      throw new AppError(404, "Item not found in library");
    }

    await this.libraryRepo.delete(userId, itemId);
    logger.info({ userId, itemId }, "Item removed from library");
    syncService.broadcast(userId, "LIBRARY_UPDATE", {
      action: "remove",
      itemId,
    });
  }

  /** Bulk remove items from the library */
  async removeBulkFromLibrary(
    userId: string,
    itemIds: string[],
  ): Promise<void> {
    if (!itemIds.length) return;
    await this.libraryRepo.deleteMany(userId, itemIds);
    logger.info(
      { userId, deletedCount: itemIds.length },
      "Bulk items removed from library",
    );
    syncService.broadcast(userId, "LIBRARY_UPDATE", {
      action: "bulk-remove",
      itemIds,
    });
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
      durationSource?: WatchProgressDurationSource;
      title: string;
      poster?: string;
    },
  ): Promise<WatchProgress> {
    const existing = await this.progressRepo.findByIdentity(
      userId,
      data.itemId,
      data.season,
      data.episode,
    );
    const normalized = normalizeProgressDuration(data, existing);
    const record = await this.progressRepo.upsert({
      userId,
      type: data.type as ContentType,
      itemId: data.itemId,
      season: data.season ?? null,
      episode: data.episode ?? null,
      currentTime: normalized.currentTime,
      duration: normalized.duration,
      durationSource: normalized.durationSource,
      title: data.title,
      poster: data.poster ?? null,
    });

    logger.debug({ userId, itemId: data.itemId }, "Watch progress updated");

    // Background sync to Trakt if connected
    this.traktService
      .syncWatchProgress(userId, {
        type: data.type as "movie" | "series",
        itemId: data.itemId,
        season: data.season,
        episode: data.episode,
        title: data.title,
      })
      .catch((err) =>
        logger.warn({ userId, err }, "Trakt sync failed in background"),
      );

    const result = this.toWatchProgress(record);
    syncService.broadcast(userId, "PROGRESS_UPDATE", result);
    return result;
  }

  /** Get continue-watching list (recently watched, not completed) */
  async getContinueWatching(
    userId: string,
    limit = 20,
  ): Promise<WatchProgress[]> {
    const records = await this.progressRepo.findByUser(userId, limit);

    // Unknown and legacy durations remain resumable, but must never be used
    // to infer that a title is complete.
    const inProgress = records.filter((r) => {
      if (r.currentTime <= 0) return false;
      if (!isTrustedDurationSource(r.durationSource) || r.duration <= 0) {
        return true;
      }
      const pct = r.currentTime / r.duration;
      return pct < 0.95;
    });

    return inProgress.map((r) => this.toWatchProgress(r));
  }

  /**
   * Returns every recorded title, including completed titles, in stable cursor
   * order. History is independent from Library membership and offline files.
   */
  async getWatchHistory(
    userId: string,
    options: { cursor?: string; limit: number },
  ): Promise<WatchHistoryPage> {
    const cursor = options.cursor
      ? decodeHistoryCursor(options.cursor)
      : undefined;
    const records = await this.progressRepo.findHistoryByUser(userId, {
      cursor,
      limit: options.limit + 1,
    });
    const hasMore = records.length > options.limit;
    const items = records.slice(0, options.limit);
    const last = items.at(-1);

    return {
      items: items.map((record) => this.toWatchProgress(record)),
      ...(hasMore && last
        ? { nextCursor: encodeHistoryCursor(last.lastWatched, last.id) }
        : {}),
    };
  }

  /** Remove an item from Continue Watching without touching the library. */
  async removeProgress(userId: string, itemId: string): Promise<void> {
    await this.progressRepo.delete(userId, itemId);
    logger.info({ userId, itemId }, "Watch progress removed");
    syncService.broadcast(userId, "PROGRESS_UPDATE", {
      action: "remove",
      itemId,
    });
  }

  /**
   * Remove one watch-history entry without removing other episodes from the
   * same series. Continue Watching intentionally keeps its existing
   * item-level removal behaviour.
   */
  async removeWatchHistoryEntry(
    userId: string,
    historyId: string,
  ): Promise<void> {
    const deleted = await this.progressRepo.deleteById(userId, historyId);
    if (!deleted) {
      throw new AppError(404, "Watch history entry not found");
    }

    logger.info({ userId, historyId }, "Watch history entry removed");
    syncService.broadcast(userId, "PROGRESS_UPDATE", {
      action: "remove-history",
      historyId,
    });
  }

  async clearWatchHistory(userId: string): Promise<void> {
    await this.progressRepo.deleteAll(userId);
    logger.info({ userId }, "Watch history cleared");
    syncService.broadcast(userId, "PROGRESS_UPDATE", { action: "clear" });
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
      season: normalizeProgressCoordinate(record.season),
      episode: normalizeProgressCoordinate(record.episode),
      currentTime: record.currentTime,
      duration: record.duration,
      durationSource: record.durationSource,
      title: record.title,
      poster: record.poster,
      lastWatched: record.lastWatched.toISOString(),
    };
  }
}

/**
 * Prisma stores zero as the identity sentinel for content without episode
 * coordinates. Never expose that persistence detail through the public API:
 * playback request schemas intentionally only accept positive coordinates.
 */
export function normalizeProgressCoordinate(
  value: number | null | undefined,
): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

const DURATION_SOURCE_RANK: Record<WatchProgressDurationSource, number> = {
  unknown: 0,
  legacy: 1,
  metadata: 2,
  media: 3,
};

function isTrustedDurationSource(source: WatchProgressDurationSource) {
  return source === "metadata" || source === "media";
}

export function normalizeProgressDuration(
  input: {
    currentTime: number;
    duration: number;
    durationSource?: WatchProgressDurationSource;
  },
  existing?: WatchProgressRecord | null,
): {
  currentTime: number;
  duration: number;
  durationSource: WatchProgressDurationSource;
} {
  let durationSource = input.durationSource ?? "legacy";
  let duration =
    Number.isFinite(input.duration) && input.duration > 0 ? input.duration : 0;
  if (duration === 0) durationSource = "unknown";

  if (existing) {
    const existingRank = DURATION_SOURCE_RANK[existing.durationSource];
    const incomingRank = DURATION_SOURCE_RANK[durationSource];
    const lowerConfidence = incomingRank < existingRank;
    const metadataCannotReplaceMedia =
      existing.durationSource === "media" && durationSource === "metadata";
    const suspiciousLowerPriorityChange =
      existing.duration > 0 &&
      duration > 0 &&
      durationSource !== "media" &&
      Math.abs(duration - existing.duration) / existing.duration > 0.2 &&
      incomingRank <= existingRank;

    if (
      lowerConfidence ||
      metadataCannotReplaceMedia ||
      suspiciousLowerPriorityChange
    ) {
      duration = existing.duration;
      durationSource = existing.durationSource;
    }
  }

  const rawCurrentTime =
    Number.isFinite(input.currentTime) && input.currentTime > 0
      ? input.currentTime
      : 0;
  return {
    currentTime:
      duration > 0 && isTrustedDurationSource(durationSource)
        ? Math.min(rawCurrentTime, duration)
        : rawCurrentTime,
    duration,
    durationSource,
  };
}

export function encodeHistoryCursor(lastWatched: Date, id: string): string {
  return Buffer.from(
    `${lastWatched.toISOString()}\u0000${id}`,
    "utf8",
  ).toString("base64url");
}

export function decodeHistoryCursor(cursor: string): {
  lastWatched: Date;
  id: string;
} {
  try {
    const [timestamp, id] = Buffer.from(cursor, "base64url")
      .toString("utf8")
      .split("\u0000");
    const lastWatched = new Date(timestamp ?? "");
    if (!id || Number.isNaN(lastWatched.getTime())) throw new Error("invalid");
    return { lastWatched, id };
  } catch {
    throw new AppError(400, "Watch history cursor is invalid");
  }
}
