import { ContentType } from "@prisma/client";

/** Port: Library item persistence */
export interface ILibraryRepository {
  findByUser(userId: string): Promise<LibraryItemRecord[]>;
  findByUserAndItem(
    userId: string,
    itemId: string,
  ): Promise<LibraryItemRecord | null>;
  create(data: {
    userId: string;
    type: ContentType;
    itemId: string;
    title: string;
    poster?: string | null;
  }): Promise<LibraryItemRecord>;
  delete(userId: string, itemId: string): Promise<void>;
  deleteMany(userId: string, itemIds: string[]): Promise<void>;
}

/** Port: Watch progress persistence */
export interface IWatchProgressRepository {
  findByUser(userId: string, limit?: number): Promise<WatchProgressRecord[]>;
  findHistoryByUser(
    userId: string,
    options: { limit: number; cursor?: { lastWatched: Date; id: string } },
  ): Promise<WatchProgressRecord[]>;
  upsert(data: {
    userId: string;
    type: ContentType;
    itemId: string;
    season?: number | null;
    episode?: number | null;
    currentTime: number;
    duration: number;
    title: string;
    poster?: string | null;
  }): Promise<WatchProgressRecord>;
  delete(userId: string, itemId: string): Promise<void>;
  deleteById(userId: string, historyId: string): Promise<boolean>;
  deleteAll(userId: string): Promise<void>;
}

/** Internal domain record for a library item */
export interface LibraryItemRecord {
  id: string;
  userId: string;
  type: ContentType;
  itemId: string;
  title: string;
  poster: string | null;
  addedAt: Date;
}

/** Internal domain record for watch progress */
export interface WatchProgressRecord {
  id: string;
  userId: string;
  type: ContentType;
  itemId: string;
  season: number | null;
  episode: number | null;
  currentTime: number;
  duration: number;
  title: string;
  poster: string | null;
  lastWatched: Date;
}
