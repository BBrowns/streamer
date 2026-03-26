import { logger } from "../../config/logger.js";
import type {
  ITraktClient,
  ITraktRepository,
  TraktTokens,
  TraktScrobbleItem,
} from "./ports/trakt.ports.js";

export class TraktService {
  constructor(
    private readonly traktClient: ITraktClient,
    private readonly traktRepo: ITraktRepository,
  ) {}

  private syncInterval: NodeJS.Timeout | null = null;

  /** Start background queue processing */
  startBackgroundSync(intervalMs = 60 * 1000): void {
    if (this.syncInterval) return;
    this.syncInterval = setInterval(() => {
      this.processQueue().catch((err) =>
        logger.error({ error: err.message }, "Error in background Trakt sync"),
      );
    }, intervalMs);
    logger.info({ intervalMs }, "Trakt background sync started");
  }

  /** Stop background queue processing */
  stopBackgroundSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info("Trakt background sync stopped");
    }
  }

  /** Get valid access token for a user, refreshing if necessary */
  async getValidToken(userId: string): Promise<string | null> {
    const tokens = await this.traktRepo.findByUser(userId);
    if (!tokens) return null;

    // Buffer of 5 minutes before expiration
    const isExpired = tokens.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;

    if (isExpired) {
      try {
        logger.info({ userId }, "Refreshing Trakt tokens");
        const newTokens = await this.traktClient.refreshTokens(
          tokens.refreshToken,
        );
        await this.traktRepo.upsert(userId, newTokens);
        return newTokens.accessToken;
      } catch (err) {
        logger.error({ userId, error: err }, "Failed to refresh Trakt tokens");
        return null;
      }
    }

    return tokens.accessToken;
  }

  /** Sync watch progress report to Trakt */
  async syncWatchProgress(
    userId: string,
    data: {
      type: "movie" | "series";
      itemId: string;
      season?: number;
      episode?: number;
      title: string;
    },
  ): Promise<void> {
    const accessToken = await this.getValidToken(userId);
    if (!accessToken) return;

    // Extract IMDB ID if present (assuming itemId might be "tt..." or similar)
    // In our system, itemId is often the IMDB ID.
    const imdbId = data.itemId.startsWith("tt") ? data.itemId : undefined;

    try {
      await this.traktClient.syncWatchHistory(accessToken, [
        {
          type: data.type === "movie" ? "movie" : "episode",
          imdbId,
          title: data.title,
          watchedAt: new Date().toISOString(),
          season: data.season,
          episode: data.episode,
        },
      ]);
      logger.debug({ userId, itemId: data.itemId }, "Sync to Trakt successful");
    } catch (err: any) {
      logger.warn(
        { userId, error: err.message },
        "Trakt sync failed, adding to queue",
      );
      // Add to queue for retry
      await this.traktRepo.addToQueue(userId, {
        type: data.type === "movie" ? "movie" : "episode",
        imdbId,
        title: data.title,
        season: data.season,
        episode: data.episode,
        watchedAt: new Date(),
      });
    }
  }

  /** Scrobble playback status */
  async scrobble(
    userId: string,
    action: "start" | "pause" | "stop",
    data: {
      type: "movie" | "series";
      itemId: string;
      title: string;
      progress: number;
      season?: number;
      episode?: number;
    },
  ): Promise<void> {
    const accessToken = await this.getValidToken(userId);
    if (!accessToken) return;

    const imdbId = data.itemId.startsWith("tt") ? data.itemId : undefined;

    await this.traktClient.scrobble(accessToken, action, {
      type: data.type === "movie" ? "movie" : "episode",
      imdbId,
      title: data.title,
      progress: data.progress,
      season: data.season,
      episode: data.episode,
    });
  }

  /** Process pending sync items in queue */
  async processQueue(limit = 10): Promise<void> {
    const queue = await this.traktRepo.getQueue(limit);
    if (queue.length === 0) return;

    logger.debug({ count: queue.length }, "Processing Trakt sync queue");

    for (const item of queue) {
      if (item.attempts >= 5) {
        logger.error(
          { itemId: item.id, userId: item.userId },
          "Trakt sync item exceeded max attempts, removing",
        );
        await this.traktRepo.removeFromQueue(item.id);
        continue;
      }

      const accessToken = await this.getValidToken(item.userId);
      if (!accessToken) continue;

      try {
        await this.traktClient.syncWatchHistory(accessToken, [
          {
            type: item.type,
            imdbId: item.imdbId,
            title: item.title,
            watchedAt: item.watchedAt.toISOString(),
            season: item.season,
            episode: item.episode,
          },
        ]);
        await this.traktRepo.removeFromQueue(item.id);
        logger.debug(
          { itemId: item.id },
          "Successfully synced item from queue",
        );
      } catch (err: any) {
        await this.traktRepo.updateQueueAttempt(item.id, err.message);
      }
    }
  }

  /** Handle OAuth callback code */
  async connectAccount(
    userId: string,
    code: string,
    redirectUri?: string,
  ): Promise<void> {
    const tokens = await this.traktClient.exchangeCode(code, redirectUri);
    await this.traktRepo.upsert(userId, tokens);
    logger.info({ userId }, "Trakt account connected");
  }

  /** Disconnect Trakt account */
  async disconnectAccount(userId: string): Promise<void> {
    await this.traktRepo.delete(userId);
    logger.info({ userId }, "Trakt account disconnected");
  }
}
