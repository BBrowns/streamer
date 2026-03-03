/** A saved item in the user's library / watchlist */
export interface LibraryItem {
  id: string;
  userId: string;
  type: "movie" | "series";
  itemId: string;
  title: string;
  poster?: string | null;
  addedAt: string;
}

/** Watch progress for resume / continue-watching */
export interface WatchProgress {
  id: string;
  userId: string;
  type: "movie" | "series";
  itemId: string;
  season?: number | null;
  episode?: number | null;
  currentTime: number;
  duration: number;
  title: string;
  poster?: string | null;
  lastWatched: string;
}

/** Request to add an item to the library */
export interface AddToLibraryRequest {
  type: "movie" | "series";
  itemId: string;
  title: string;
  poster?: string;
}

/** Request to remove an item from the library */
export interface RemoveFromLibraryRequest {
  itemId: string;
}

/** Request to update/report watch progress */
export interface UpdateProgressRequest {
  type: "movie" | "series";
  itemId: string;
  season?: number;
  episode?: number;
  currentTime: number;
  duration: number;
  title: string;
  poster?: string;
}
