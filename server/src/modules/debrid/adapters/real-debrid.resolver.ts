import type { Stream } from "@streamer/shared";
import type {
  IDebridResolver,
  ResolvedStream,
  DebridAccountStatus,
} from "../ports/debrid.ports.js";
import { logger } from "../../../config/logger.js";

/** Port: Trakt.tv API client for watch history sync */
export interface ITraktClient {
  /** Exchange OAuth code for tokens */
  exchangeCode(code: string): Promise<TraktTokens>;

  /** Refresh expired tokens */
  refreshTokens(refreshToken: string): Promise<TraktTokens>;

  /** Sync watch history to Trakt */
  syncWatchHistory(accessToken: string, items: TraktWatchItem[]): Promise<void>;

  /** Get Trakt watchlist */
  getWatchlist(accessToken: string): Promise<TraktWatchlistItem[]>;
}

export interface TraktTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface TraktWatchItem {
  type: "movie" | "episode";
  imdbId?: string;
  tmdbId?: number;
  title: string;
  watchedAt: string;
  season?: number;
  episode?: number;
}

export interface TraktWatchlistItem {
  type: "movie" | "show";
  title: string;
  imdbId?: string;
  tmdbId?: number;
  poster?: string;
}

/**
 * Real-Debrid adapter (placeholder implementation).
 *
 * Requires `RD_API_TOKEN` environment variable.
 * The full implementation would use the Real-Debrid API v2:
 * https://api.real-debrid.com/rest/2.0/
 */
export class RealDebridResolver implements IDebridResolver {
  private readonly apiToken: string | undefined;

  constructor() {
    this.apiToken = process.env.RD_API_TOKEN;
  }

  canResolve(stream: Stream): boolean {
    // Real-Debrid can resolve magnet links and some HTTP links
    if (!this.apiToken) return false;
    return !!(
      stream.infoHash ||
      (stream.url && !stream.url.startsWith("magnet:"))
    );
  }

  async resolve(
    stream: Stream,
    requestId: string,
  ): Promise<ResolvedStream | null> {
    if (!this.apiToken) {
      logger.debug(
        { requestId },
        "Real-Debrid not configured, skipping resolution",
      );
      return null;
    }

    // Placeholder: In production, this would:
    // 1. POST /rest/2.0/torrents/addMagnet with the infoHash
    // 2. POST /rest/2.0/torrents/selectFiles to select the video file
    // 3. GET /rest/2.0/torrents/info to get the download link
    // 4. POST /rest/2.0/unrestrict/link to get the unrestricted URL
    logger.info(
      { requestId, stream: stream.title },
      "Real-Debrid resolution placeholder",
    );

    return null;
  }

  async getAccountStatus(): Promise<DebridAccountStatus> {
    if (!this.apiToken) {
      return { isActive: false, isPremium: false };
    }

    // Placeholder: GET /rest/2.0/user
    return {
      isActive: true,
      isPremium: true,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
