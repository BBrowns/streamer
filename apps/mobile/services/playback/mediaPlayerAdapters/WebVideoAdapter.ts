import type { MediaPlayerCapabilities } from "../MediaPlayerAdapter";
import {
  ExpoVideoAdapterBase,
  type ExpoVideoPlayerLike,
} from "./ExpoVideoAdapterBase";

export interface WebVideoElement {
  readyState?: number;
  requestFullscreen?: () => Promise<void> | void;
  requestPictureInPicture?: () => Promise<unknown> | unknown;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
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

export class WebVideoAdapter extends ExpoVideoAdapterBase {
  constructor(
    player: ExpoVideoPlayerLike,
    protected readonly options: WebVideoAdapterOptions = {},
    target: "web" | "electron" = "web",
  ) {
    super(player, target);
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
