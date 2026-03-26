import { logger } from "../../config/logger.js";
import type {
  ITraktClient,
  ITraktRepository,
  TraktTokens,
} from "./ports/trakt.ports.js";

export class TraktService {
  constructor(
    private readonly traktClient: ITraktClient,
    private readonly traktRepo: ITraktRepository,
  ) {}

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
    } catch (err) {
      // We don't throw here to avoid failing the main request
      logger.warn({ userId, error: err }, "Trakt sync failed in background");
    }
  }

  /** Handle OAuth callback code */
  async connectAccount(userId: string, code: string): Promise<void> {
    const tokens = await this.traktClient.exchangeCode(code);
    await this.traktRepo.upsert(userId, tokens);
    logger.info({ userId }, "Trakt account connected");
  }

  /** Disconnect Trakt account */
  async disconnectAccount(userId: string): Promise<void> {
    await this.traktRepo.delete(userId);
    logger.info({ userId }, "Trakt account disconnected");
  }
}
