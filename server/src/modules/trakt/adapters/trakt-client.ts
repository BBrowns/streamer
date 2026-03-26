import axios from "axios";
import type {
  ITraktClient,
  TraktTokens,
  TraktWatchItem,
  TraktWatchlistItem,
} from "../ports/trakt.ports.js";
import { logger } from "../../../config/logger.js";

export class TraktClient implements ITraktClient {
  private readonly baseUrl = "https://api.trakt.tv";
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor() {
    this.clientId = process.env.TRAKT_CLIENT_ID || "";
    this.clientSecret = process.env.TRAKT_CLIENT_SECRET || "";
    this.redirectUri = process.env.TRAKT_REDIRECT_URI || "";
  }

  private get headers() {
    return {
      "Content-Type": "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": this.clientId,
    };
  }

  async exchangeCode(code: string): Promise<TraktTokens> {
    const response = await axios.post(`${this.baseUrl}/oauth/token`, {
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: "authorization_code",
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: new Date(Date.now() + response.data.expires_in * 1000),
    };
  }

  async refreshTokens(refreshToken: string): Promise<TraktTokens> {
    const response = await axios.post(`${this.baseUrl}/oauth/token`, {
      refresh_token: refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri,
      grant_type: "refresh_token",
    });

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: new Date(Date.now() + response.data.expires_in * 1000),
    };
  }

  async syncWatchHistory(
    accessToken: string,
    items: TraktWatchItem[],
  ): Promise<void> {
    const payload: any = {
      movies: [],
      shows: [],
    };

    for (const item of items) {
      if (item.type === "movie") {
        payload.movies.push({
          ids: {
            imdb: item.imdbId,
            tmdb: item.tmdbId,
          },
          watched_at: item.watchedAt,
        });
      } else {
        payload.shows.push({
          ids: {
            imdb: item.imdbId,
            tmdb: item.tmdbId,
          },
          seasons: [
            {
              number: item.season,
              episodes: [
                {
                  number: item.episode,
                  watched_at: item.watchedAt,
                },
              ],
            },
          ],
        });
      }
    }

    try {
      await axios.post(`${this.baseUrl}/sync/history`, payload, {
        headers: {
          ...this.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err: any) {
      logger.error(
        { error: err.response?.data || err.message },
        "Failed to sync history to Trakt",
      );
      throw new Error("Trakt sync failed");
    }
  }

  async getWatchlist(accessToken: string): Promise<TraktWatchlistItem[]> {
    const response = await axios.get(`${this.baseUrl}/sync/watchlist`, {
      headers: {
        ...this.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data.map((item: any) => ({
      type: item.type,
      title: item[item.type].title,
      imdbId: item[item.type].ids.imdb,
      tmdbId: item[item.type].ids.tmdb,
    }));
  }
}
