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

export interface TraktScrobbleItem {
  type: "movie" | "episode";
  imdbId?: string;
  tmdbId?: number;
  title: string;
  season?: number;
  episode?: number;
  progress: number; // 0-100
}

export interface TraktSyncQueueItem {
  id: string;
  userId: string;
  type: "movie" | "episode";
  imdbId?: string;
  title: string;
  season?: number;
  episode?: number;
  watchedAt: Date;
  attempts: number;
}

/** Port: Trakt.tv API client for watch history sync */
export interface ITraktClient {
  /** Exchange OAuth code for tokens */
  exchangeCode(code: string, redirectUri?: string): Promise<TraktTokens>;

  /** Refresh expired tokens */
  refreshTokens(refreshToken: string): Promise<TraktTokens>;

  /** Sync watch history to Trakt */
  syncWatchHistory(accessToken: string, items: TraktWatchItem[]): Promise<void>;

  /** Get Trakt watchlist */
  getWatchlist(accessToken: string): Promise<TraktWatchlistItem[]>;

  /** Scrobble playback status (start, pause, stop) */
  scrobble(
    accessToken: string,
    action: "start" | "pause" | "stop",
    item: TraktScrobbleItem,
  ): Promise<void>;
}

/** Port: Trakt token persistence */
export interface ITraktRepository {
  findByUser(userId: string): Promise<TraktTokens | null>;
  upsert(userId: string, tokens: TraktTokens): Promise<void>;
  delete(userId: string): Promise<void>;

  /** Queue management */
  addToQueue(
    userId: string,
    item: Omit<TraktSyncQueueItem, "id" | "attempts" | "userId">,
  ): Promise<void>;
  getQueue(limit?: number): Promise<TraktSyncQueueItem[]>;
  updateQueueAttempt(id: string, error: string): Promise<void>;
  removeFromQueue(id: string): Promise<void>;
}
