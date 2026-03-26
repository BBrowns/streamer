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
}

/** Port: Trakt token persistence */
export interface ITraktRepository {
  findByUser(userId: string): Promise<TraktTokens | null>;
  upsert(userId: string, tokens: TraktTokens): Promise<void>;
  delete(userId: string): Promise<void>;
}
