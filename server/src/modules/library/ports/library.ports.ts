import type { LibraryItem, WatchProgress } from "@streamer/shared";

/** Port: Library item persistence */
export interface ILibraryRepository {
  findByUser(userId: string): Promise<LibraryItemRecord[]>;
  findByUserAndItem(
    userId: string,
    itemId: string,
  ): Promise<LibraryItemRecord | null>;
  create(data: {
    userId: string;
    type: string;
    itemId: string;
    title: string;
    poster?: string | null;
  }): Promise<LibraryItemRecord>;
  delete(userId: string, itemId: string): Promise<void>;
}

/** Port: Watch progress persistence */
export interface IWatchProgressRepository {
  findByUser(userId: string, limit?: number): Promise<WatchProgressRecord[]>;
  upsert(data: {
    userId: string;
    type: string;
    itemId: string;
    season?: number | null;
    episode?: number | null;
    currentTime: number;
    duration: number;
    title: string;
    poster?: string | null;
  }): Promise<WatchProgressRecord>;
  delete(userId: string, itemId: string): Promise<void>;
}

/** Internal domain record for a library item */
export interface LibraryItemRecord {
  id: string;
  userId: string;
  type: string;
  itemId: string;
  title: string;
  poster: string | null;
  addedAt: Date;
}

/** Internal domain record for watch progress */
export interface WatchProgressRecord {
  id: string;
  userId: string;
  type: string;
  itemId: string;
  season: number | null;
  episode: number | null;
  currentTime: number;
  duration: number;
  title: string;
  poster: string | null;
  lastWatched: Date;
}
