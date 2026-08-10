import type {
  MediaPlayerCapabilities,
  MediaPlayerThumbnail,
  MediaThumbnailOptions,
} from "../MediaPlayerAdapter";
import {
  ExpoVideoAdapterBase,
  type ExpoVideoPlayerLike,
} from "./ExpoVideoAdapterBase";

export type NativeMediaPlatform = "ios" | "android";

export interface NativeVideoSurface {
  enterFullscreen?: () => Promise<void> | void;
  startPictureInPicture?: () => Promise<void> | void;
  enterPictureInPicture?: () => Promise<void> | void;
}

export interface NativeExpoVideoAdapterOptions {
  resolveSurface?: () => NativeVideoSurface | null;
  pictureInPictureSupported?: boolean;
}

export class NativeExpoVideoAdapter extends ExpoVideoAdapterBase {
  constructor(
    player: ExpoVideoPlayerLike,
    private readonly platform: NativeMediaPlatform,
    private readonly options: NativeExpoVideoAdapterOptions = {},
  ) {
    super(player, platform === "ios" ? "native-ios" : "native-android");
  }

  protected platformCapabilities(): Omit<
    MediaPlayerCapabilities,
    "target" | "sourceReplacement"
  > {
    const surface = this.options.resolveSurface?.();
    return {
      // Native viewers retain the platform/system volume UX used today.
      playerVolume: false,
      audioTracks: true,
      embeddedSubtitles: true,
      fullscreen: typeof surface?.enterFullscreen === "function",
      pictureInPicture:
        this.options.pictureInPictureSupported === true &&
        (typeof surface?.startPictureInPicture === "function" ||
          typeof surface?.enterPictureInPicture === "function"),
      nativeThumbnails:
        typeof this.player.generateThumbnailsAsync === "function",
    };
  }

  override beginScrubbing() {
    if (this.platform === "ios") this.player.pause();
    this.player.scrubbingModeOptions = {
      scrubbingModeEnabled: true,
      increaseCodecOperatingRate: true,
    };
    this.player.seekTolerance = {
      toleranceBefore: 1,
      toleranceAfter: 1,
    };
  }

  override commitSeek(position: number) {
    if (!Number.isFinite(position) || position < 0) return;
    this.player.seekTolerance = {
      toleranceBefore: 0,
      toleranceAfter: 0,
    };
    this.player.currentTime = position;
  }

  override endScrubbing({ shouldResume }: { shouldResume: boolean }) {
    this.player.scrubbingModeOptions = {
      scrubbingModeEnabled: false,
    };
    this.player.seekTolerance = {
      toleranceBefore: 0,
      toleranceAfter: 0,
    };
    super.endScrubbing({ shouldResume });
  }

  override async generateThumbnails(
    times: number[],
    options?: MediaThumbnailOptions,
  ): Promise<MediaPlayerThumbnail[]> {
    if (
      typeof this.player.generateThumbnailsAsync !== "function" ||
      times.length === 0
    ) {
      return [];
    }
    return this.player.generateThumbnailsAsync(times, options);
  }

  override async requestFullscreen() {
    const surface = this.options.resolveSurface?.();
    if (typeof surface?.enterFullscreen !== "function") return false;
    try {
      await surface.enterFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  override async requestPictureInPicture() {
    if (!this.options.pictureInPictureSupported) return false;
    const surface = this.options.resolveSurface?.();
    const request =
      surface?.startPictureInPicture || surface?.enterPictureInPicture;
    if (!request) return false;
    try {
      await request.call(surface);
      return true;
    } catch {
      return false;
    }
  }
}
