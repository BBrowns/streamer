/**
 * Application-facing media player port.
 *
 * Keep this module independent from Expo, browser and Electron APIs. Concrete
 * adapters translate those runtime-specific APIs into this bounded contract.
 */

export type MediaAdapterPlatform = "ios" | "android" | "web";

export type MediaPlayerTarget =
  "native-ios" | "native-android" | "web" | "electron";

export type MediaAdapterStatus = "idle" | "loading" | "ready" | "error";

export interface MediaTimeRange {
  start: number;
  end: number;
}

/** Whether the active source can reach a title-relative position right now. */
export function isMediaPositionSeekable(
  position: number,
  seekableRanges: readonly MediaTimeRange[] | undefined,
  seekableOnRequest = false,
): boolean {
  if (!Number.isFinite(position) || position < 0) return false;
  if (seekableOnRequest || seekableRanges === undefined) return true;
  return seekableRanges.some(
    ({ start, end }) =>
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start &&
      position >= start &&
      position <= end,
  );
}

export interface MediaSeekOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface NormalizedMediaTrack {
  id: string;
  kind: "audio" | "subtitle";
  language: string;
  label: string;
  active: boolean;
  isDefault: boolean;
  autoSelect: boolean;
}

export interface MediaPlayerSnapshot {
  status: MediaAdapterStatus;
  /** Current position in seconds from the start of the title. */
  currentTime: number;
  /** Raw player timestamp that maps to title time zero. */
  timeOriginSeconds: number;
  duration: number;
  bufferedPosition: number;
  /** Title-relative ranges for media currently loaded by the player. */
  bufferedRanges: MediaTimeRange[];
  /** Title-relative ranges the media runtime can seek to immediately. */
  seekableRanges: MediaTimeRange[];
  /** The HLS VOD manifest can generate a requested range on demand. */
  seekableOnRequest?: boolean;
  playing: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  canSeek: boolean;
}

export interface MediaPlayerCapabilities {
  target: MediaPlayerTarget;
  sourceReplacement: boolean;
  playerVolume: boolean;
  fullscreen: boolean;
  pictureInPicture: boolean;
  nativeThumbnails: boolean;
  audioTracks: boolean;
  embeddedSubtitles: boolean;
}

export interface MediaPlayerError {
  code: "MEDIA_ERROR";
  message: string;
}

export type MediaPlayerEvent =
  | {
      type: "status_changed";
      status: MediaAdapterStatus;
      error?: MediaPlayerError;
    }
  | { type: "playing_changed"; playing: boolean }
  | {
      type: "time_updated";
      currentTime: number;
      bufferedPosition: number;
    }
  | { type: "source_loaded" }
  | { type: "seek_rejected"; position: number; start: number; end: number }
  | { type: "first_frame_rendered" }
  | { type: "tracks_changed" }
  | { type: "volume_changed"; muted: boolean; volume: number }
  | { type: "completed" };

export type MediaPlayerEventListener = (event: MediaPlayerEvent) => void;
export type MediaPlayerUnsubscribe = () => void;

export interface MediaThumbnailOptions {
  maxWidth?: number;
  maxHeight?: number;
}

/**
 * Thumbnail values are deliberately opaque. Native Expo thumbnails and safe
 * bridge-backed web previews have different representations, while the UI
 * only needs to pass the selected value to its image renderer.
 */
export type MediaPlayerThumbnail = unknown;

export interface MediaPlayerAdapter {
  getCapabilities(): MediaPlayerCapabilities;
  snapshot(): MediaPlayerSnapshot;
  subscribe(listener: MediaPlayerEventListener): MediaPlayerUnsubscribe;
  play(): void;
  pause(): void;
  seekBy(seconds: number, options?: MediaSeekOptions): Promise<number>;
  previewSeek(position: number): void;
  commitSeek(position: number, options?: MediaSeekOptions): Promise<number>;
  beginScrubbing(): void;
  endScrubbing(options: { shouldResume: boolean }): void;
  replaceSource(source: string): Promise<void>;
  setPlaybackRate(rate: number): boolean;
  setMuted(muted: boolean): boolean;
  setVolume(volume: number): boolean;
  getAudioTracks(): NormalizedMediaTrack[];
  getSubtitleTracks(): NormalizedMediaTrack[];
  selectAudioTrack(id: string): boolean;
  selectSubtitleTrack(id: string | null): boolean;
  generateThumbnails(
    times: number[],
    options?: MediaThumbnailOptions,
  ): Promise<MediaPlayerThumbnail[]>;
  requestFullscreen(): Promise<boolean>;
  requestPictureInPicture(): Promise<boolean>;
}
