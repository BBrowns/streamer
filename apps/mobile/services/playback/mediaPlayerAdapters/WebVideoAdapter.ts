import type {
  MediaPlayerCapabilities,
  MediaPlayerSnapshot,
  MediaTimeRange,
} from "../MediaPlayerAdapter";
import {
  ExpoVideoAdapterBase,
  type ExpoVideoPlayerLike,
} from "./ExpoVideoAdapterBase";

export interface WebVideoElement {
  readyState?: number;
  currentTime?: number;
  duration?: number;
  buffered?: WebTimeRangeList;
  seekable?: WebTimeRangeList;
  requestFullscreen?: () => Promise<void> | void;
  requestPictureInPicture?: () => Promise<unknown> | unknown;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
}

export interface WebTimeRangeList {
  length: number;
  start(index: number): number;
  end(index: number): number;
}

export interface WebMediaDocument {
  fullscreenElement?: unknown;
  pictureInPictureEnabled?: boolean;
  exitFullscreen?: () => Promise<void> | void;
}

export interface WebVideoAdapterOptions {
  /** Resolves only the video surface owned by this player instance. */
  resolveVideoElement?: () => WebVideoElement | null;
  document?: WebMediaDocument;
}

function readElementRanges(
  ranges: WebTimeRangeList | undefined,
  timeOriginSeconds: number,
): MediaTimeRange[] | undefined {
  if (!ranges || !Number.isFinite(ranges.length)) return undefined;
  const rangeCount = Math.max(0, Math.min(1_000, Math.floor(ranges.length)));
  const result: MediaTimeRange[] = [];
  for (let index = 0; index < rangeCount; index += 1) {
    try {
      const rawStart = ranges.start(index);
      const rawEnd = ranges.end(index);
      if (
        !Number.isFinite(rawStart) ||
        !Number.isFinite(rawEnd) ||
        rawEnd <= rawStart
      )
        continue;
      const start = Math.max(0, rawStart - timeOriginSeconds);
      const end = Math.max(0, rawEnd - timeOriginSeconds);
      if (end > start) result.push({ start, end });
    } catch {
      // A media range can disappear between reading its length and its edges.
    }
  }
  return result;
}

export class WebVideoAdapter extends ExpoVideoAdapterBase {
  constructor(
    player: ExpoVideoPlayerLike,
    protected readonly options: WebVideoAdapterOptions = {},
    target: "web" | "electron" = "web",
    timeOriginSeconds = 0,
  ) {
    super(player, target, timeOriginSeconds);
  }

  override snapshot(): MediaPlayerSnapshot {
    const snapshot = super.snapshot();
    const video = this.options.resolveVideoElement?.();
    if (!video) return snapshot;

    const timeOriginSeconds = snapshot.timeOriginSeconds;
    const elementDuration = video.duration;
    const duration =
      typeof elementDuration === "number" &&
      Number.isFinite(elementDuration) &&
      elementDuration > 0
        ? Math.max(0, elementDuration - timeOriginSeconds)
        : snapshot.duration;
    const elementCurrentTime = video.currentTime;
    const currentTime =
      typeof elementCurrentTime === "number" &&
      Number.isFinite(elementCurrentTime)
        ? Math.max(0, elementCurrentTime - timeOriginSeconds)
        : snapshot.currentTime;
    const bufferedRanges =
      readElementRanges(video.buffered, timeOriginSeconds) ??
      snapshot.bufferedRanges;
    const seekableRanges =
      readElementRanges(video.seekable, timeOriginSeconds) ??
      snapshot.seekableRanges;
    const bufferedPosition = bufferedRanges.reduce(
      (latest, range) => Math.max(latest, range.end),
      0,
    );

    return {
      ...snapshot,
      currentTime,
      duration,
      bufferedPosition,
      bufferedRanges,
      seekableRanges,
      canSeek: duration > 0 && seekableRanges.length > 0,
    };
  }

  protected platformCapabilities(): Omit<
    MediaPlayerCapabilities,
    "target" | "sourceReplacement"
  > {
    const video = this.options.resolveVideoElement?.();
    const document = this.options.document;
    const standardPictureInPicture =
      typeof video?.requestPictureInPicture === "function" &&
      document?.pictureInPictureEnabled !== false;
    const webkitPictureInPicture = Boolean(
      video?.webkitSupportsPresentationMode?.("picture-in-picture") &&
      video.webkitSetPresentationMode,
    );
    return {
      playerVolume: true,
      // expo-video does not expose native audio/subtitle track selection on
      // its web implementation. Capability policy must therefore fail closed.
      audioTracks: false,
      embeddedSubtitles: false,
      fullscreen:
        typeof video?.requestFullscreen === "function" &&
        typeof document?.exitFullscreen === "function",
      pictureInPicture: standardPictureInPicture || webkitPictureInPicture,
      nativeThumbnails: false,
    };
  }

  override async requestFullscreen() {
    const video = this.options.resolveVideoElement?.();
    const document = this.options.document;
    if (!video || !document) return false;
    try {
      if (document.fullscreenElement) {
        if (typeof document.exitFullscreen !== "function") return false;
        await document.exitFullscreen();
        return true;
      }
      if (typeof video.requestFullscreen !== "function") return false;
      await video.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  override async requestPictureInPicture() {
    const video = this.options.resolveVideoElement?.();
    if (!video || (video.readyState ?? 0) < 1) return false;
    try {
      if (
        typeof video.requestPictureInPicture === "function" &&
        this.options.document?.pictureInPictureEnabled !== false
      ) {
        await video.requestPictureInPicture();
        return true;
      }
      if (
        video.webkitSupportsPresentationMode?.("picture-in-picture") &&
        typeof video.webkitSetPresentationMode === "function"
      ) {
        video.webkitSetPresentationMode("picture-in-picture");
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}
