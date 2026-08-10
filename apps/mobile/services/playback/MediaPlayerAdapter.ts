/**
 * Application-facing media player port.
 *
 * Keep this module independent from Expo, browser and Electron APIs. Concrete
 * adapters translate those runtime-specific APIs into this bounded contract.
 */

export type MediaAdapterPlatform = "ios" | "android" | "web";

export type MediaPlayerTarget =
  | "native-ios"
  | "native-android"
  | "web"
  | "electron";

export type MediaAdapterStatus = "idle" | "loading" | "ready" | "error";

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
  currentTime: number;
  duration: number;
  bufferedPosition: number;
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
  seekBy(seconds: number): void;
  previewSeek(position: number): void;
  commitSeek(position: number): void;
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
