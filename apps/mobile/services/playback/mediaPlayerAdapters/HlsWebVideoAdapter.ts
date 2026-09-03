import type {
  MediaPlayerAdapter,
  MediaPlayerCapabilities,
  MediaPlayerEvent,
  MediaPlayerEventListener,
  MediaPlayerSnapshot,
  MediaPlayerThumbnail,
  MediaThumbnailOptions,
  NormalizedMediaTrack,
} from "../MediaPlayerAdapter";
import type { WebMediaDocument } from "./WebVideoAdapter";
import type { ExpoVideoPlayerLike } from "./ExpoVideoAdapterBase";

type HlsConstructor = typeof import("hls.js").default;
type HlsInstance = InstanceType<HlsConstructor>;

export interface HlsVideoElement extends HTMLVideoElement {}

export interface HlsWebVideoAdapterOptions {
  document?: WebMediaDocument;
  onError?: () => void;
}

function toExpoStatus(status: MediaPlayerSnapshot["status"]) {
  switch (status) {
    case "loading":
      return "loading";
    case "ready":
      return "readyToPlay";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

/**
 * Adapts the HLS port to the small Expo player shape consumed by the existing
 * controller hooks. This is intentionally a facade: HLS controls must never
 * mutate the unused Expo player created by the screen.
 */
export function createHlsPlayerFacade(
  adapter: HlsWebVideoAdapter,
): ExpoVideoPlayerLike {
  const player: ExpoVideoPlayerLike = {
    get status() {
      return toExpoStatus(adapter.snapshot().status);
    },
    get currentTime() {
      return adapter.snapshot().currentTime;
    },
    set currentTime(value: number) {
      adapter.commitSeek(value);
    },
    get duration() {
      return adapter.snapshot().duration;
    },
    get bufferedPosition() {
      return adapter.snapshot().bufferedPosition;
    },
    get playing() {
      return adapter.snapshot().playing;
    },
    get muted() {
      return adapter.snapshot().muted;
    },
    set muted(value: boolean) {
      adapter.setMuted(value);
    },
    get volume() {
      return adapter.snapshot().volume;
    },
    set volume(value: number) {
      adapter.setVolume(value);
    },
    get playbackRate() {
      return adapter.snapshot().playbackRate;
    },
    set playbackRate(value: number) {
      adapter.setPlaybackRate(value);
    },
    play: () => adapter.play(),
    pause: () => adapter.pause(),
    seekBy: (seconds: number) => adapter.seekBy(seconds),
    replaceAsync: (source: string) => adapter.replaceSource(source),
    addListener: (event, listener) => {
      const unsubscribe = adapter.subscribe((mediaEvent) => {
        let payload: Record<string, unknown> | undefined;
        switch (mediaEvent.type) {
          case "status_changed":
            payload = { status: toExpoStatus(mediaEvent.status) };
            if (mediaEvent.error) payload.error = mediaEvent.error;
            break;
          case "playing_changed":
            payload = { isPlaying: mediaEvent.playing };
            break;
          case "time_updated":
            payload = {
              currentTime: mediaEvent.currentTime,
              bufferedPosition: mediaEvent.bufferedPosition,
            };
            break;
          case "volume_changed":
            payload = {
              muted: mediaEvent.muted,
              volume: mediaEvent.volume,
            };
            break;
          case "source_loaded":
          case "seek_rejected":
          case "first_frame_rendered":
            payload = {};
            break;
          case "completed":
            payload = {};
            break;
          case "tracks_changed":
            payload = {};
            break;
        }

        const eventMatches =
          (event === "statusChange" && mediaEvent.type === "status_changed") ||
          (event === "playingChange" &&
            mediaEvent.type === "playing_changed") ||
          (event === "timeUpdate" && mediaEvent.type === "time_updated") ||
          (event === "sourceLoad" && mediaEvent.type === "source_loaded") ||
          (event === "volumeChange" && mediaEvent.type === "volume_changed") ||
          (event === "mutedChange" && mediaEvent.type === "volume_changed") ||
          (event === "playToEnd" && mediaEvent.type === "completed") ||
          (event === "availableAudioTracksChange" &&
            mediaEvent.type === "tracks_changed") ||
          (event === "audioTrackChange" &&
            mediaEvent.type === "tracks_changed") ||
          (event === "availableSubtitleTracksChange" &&
            mediaEvent.type === "tracks_changed") ||
          (event === "subtitleTrackChange" &&
            mediaEvent.type === "tracks_changed");
        if (eventMatches) listener(payload);
      });
      return { remove: unsubscribe };
    },
  };
  return player;
}

/**
 * Web/Electron adapter for the job-scoped HLS/fMP4 surface. HLS.js is loaded
 * only when the selected route is HLS, so legacy progressive and direct
 * playback keep using the existing Expo adapter.
 */
export class HlsWebVideoAdapter implements MediaPlayerAdapter {
  private readonly listeners = new Set<MediaPlayerEventListener>();
  private readonly options: HlsWebVideoAdapterOptions;
  private readonly hlsVideoCapabilities: MediaPlayerCapabilities;
  private video: HlsVideoElement | null = null;
  private hls: HlsInstance | null = null;
  private source: string | null = null;
  private status: MediaPlayerSnapshot["status"] = "idle";
  private error: { code: "MEDIA_ERROR"; message: string } | undefined;
  private firstFrameReported = false;
  private destroyed = false;
  private loadGeneration = 0;

  constructor(options: HlsWebVideoAdapterOptions = {}) {
    this.options = options;
    this.hlsVideoCapabilities = {
      target:
        typeof window !== "undefined" && Boolean(window.desktopBridge)
          ? "electron"
          : "web",
      sourceReplacement: true,
      playerVolume: true,
      fullscreen: true,
      pictureInPicture: true,
      nativeThumbnails: false,
      // The bridge runtime owns audio selection by replacing the signed HLS
      // manifest variant. The browser element itself has no reliable
      // cross-browser audio-track API.
      audioTracks: false,
      embeddedSubtitles: false,
    };
  }

  mount(video: HlsVideoElement) {
    this.video = video;
    video.playsInline = true;
    video.controls = false;
    video.addEventListener("loadedmetadata", this.onLoadedMetadata);
    video.addEventListener("canplay", this.onCanPlay);
    video.addEventListener("playing", this.onPlaying);
    video.addEventListener("pause", this.onPause);
    video.addEventListener("timeupdate", this.onTimeUpdate);
    video.addEventListener("progress", this.onTimeUpdate);
    video.addEventListener("volumechange", this.onVolumeChange);
    video.addEventListener("ended", this.onEnded);
    video.addEventListener("error", this.onVideoError);
    if (this.source) void this.loadSource(this.source);
  }

  unmount() {
    const video = this.video;
    if (!video) return;
    video.removeEventListener("loadedmetadata", this.onLoadedMetadata);
    video.removeEventListener("canplay", this.onCanPlay);
    video.removeEventListener("playing", this.onPlaying);
    video.removeEventListener("pause", this.onPause);
    video.removeEventListener("timeupdate", this.onTimeUpdate);
    video.removeEventListener("progress", this.onTimeUpdate);
    video.removeEventListener("volumechange", this.onVolumeChange);
    video.removeEventListener("ended", this.onEnded);
    video.removeEventListener("error", this.onVideoError);
    this.destroyHls();
    this.video = null;
  }

  getCapabilities() {
    return { ...this.hlsVideoCapabilities };
  }

  snapshot(): MediaPlayerSnapshot {
    const video = this.video;
    const range = video ? this.getSeekableRange(video) : null;
    const duration = video ? this.seekableDurationFromRange(video, range) : 0;
    // HLS live/event playlists expose media time on an absolute timeline. The
    // player UI, however, works with a zero-based published window. Keeping
    // that translation here makes scrubbing continue to work after the
    // rolling playlist drops its earliest segments.
    const currentTime = video
      ? range
        ? Math.max(0, Math.min(duration, video.currentTime - range.start))
        : video.currentTime
      : 0;
    const bufferedPosition =
      video && video.buffered.length > 0
        ? range
          ? Math.max(
              0,
              Math.min(
                duration,
                video.buffered.end(video.buffered.length - 1) - range.start,
              ),
            )
          : video.buffered.end(video.buffered.length - 1)
        : 0;
    return {
      status: this.status,
      currentTime: Number.isFinite(currentTime) ? currentTime : 0,
      duration,
      bufferedPosition: Number.isFinite(bufferedPosition)
        ? bufferedPosition
        : 0,
      playing: Boolean(video && !video.paused && !video.ended),
      muted: Boolean(video?.muted),
      volume: video ? Math.min(1, Math.max(0, video.volume)) : 1,
      playbackRate: video?.playbackRate || 1,
      canSeek: duration > 0 && Boolean(video?.seekable.length),
    };
  }

  subscribe(listener: MediaPlayerEventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play() {
    void this.video?.play().catch(() => {
      this.emit({
        type: "status_changed",
        status: "error",
        error: { code: "MEDIA_ERROR", message: "Playback could not start." },
      });
      this.options.onError?.();
    });
  }

  pause() {
    this.video?.pause();
  }

  seekBy(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    this.commitSeek(this.snapshot().currentTime + seconds);
  }

  previewSeek(position: number) {
    this.setTime(position);
  }

  commitSeek(position: number) {
    this.setTime(position);
  }

  beginScrubbing() {}

  endScrubbing({ shouldResume }: { shouldResume: boolean }) {
    if (shouldResume) this.play();
    else this.pause();
  }

  async replaceSource(source: string) {
    this.source = source;
    this.firstFrameReported = false;
    this.error = undefined;
    if (!this.video) return;
    await this.loadSource(source);
  }

  setPlaybackRate(rate: number) {
    if (!this.video || !Number.isFinite(rate) || rate <= 0) return false;
    this.video.playbackRate = rate;
    return true;
  }

  setMuted(muted: boolean) {
    if (!this.video) return false;
    this.video.muted = muted;
    this.emit({ type: "volume_changed", muted, volume: this.video.volume });
    return true;
  }

  setVolume(volume: number) {
    if (!this.video || !Number.isFinite(volume)) return false;
    this.video.volume = Math.min(1, Math.max(0, volume));
    this.emit({
      type: "volume_changed",
      muted: this.video.muted,
      volume: this.video.volume,
    });
    return true;
  }

  getAudioTracks(): NormalizedMediaTrack[] {
    return [];
  }

  getSubtitleTracks(): NormalizedMediaTrack[] {
    return [];
  }

  selectAudioTrack(_id: string) {
    return false;
  }

  selectSubtitleTrack(_id: string | null) {
    return false;
  }

  async generateThumbnails(
    _times: number[],
    _options?: MediaThumbnailOptions,
  ): Promise<MediaPlayerThumbnail[]> {
    return [];
  }

  async requestFullscreen() {
    if (!this.video?.requestFullscreen) return false;
    try {
      await this.video.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  async requestPictureInPicture() {
    const request = this.video?.requestPictureInPicture;
    if (!request) return false;
    try {
      await request.call(this.video);
      return true;
    } catch {
      return false;
    }
  }

  destroy() {
    this.destroyed = true;
    this.unmount();
    this.listeners.clear();
  }

  private async loadSource(source: string) {
    const video = this.video;
    if (!video || this.destroyed) return;
    const generation = ++this.loadGeneration;
    this.status = "loading";
    this.emit({ type: "status_changed", status: "loading" });
    this.destroyHls();
    video.removeAttribute("src");
    video.load();

    try {
      const hlsModule = await import("hls.js");
      if (generation !== this.loadGeneration || this.destroyed) return;
      const Hls = hlsModule.default;
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: false,
          lowLatencyMode: false,
        });
        this.hls = hls;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data?.fatal) return;
          this.status = "error";
          this.error = {
            code: "MEDIA_ERROR",
            message: "The HLS stream could not be played.",
          };
          this.emit({
            type: "status_changed",
            status: "error",
            error: this.error,
          });
          this.options.onError?.();
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (generation !== this.loadGeneration) return;
          this.emit({ type: "source_loaded" });
        });
        hls.loadSource(source);
        hls.attachMedia(video);
        return;
      }
    } catch {
      // Native Safari HLS is attempted below. Failure is reported by the
      // element's own error event if the target cannot play the source.
    }

    if (generation !== this.loadGeneration) return;
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = source;
      video.load();
      return;
    }
    this.status = "error";
    this.error = {
      code: "MEDIA_ERROR",
      message: "HLS playback is not supported by this browser.",
    };
    this.emit({ type: "status_changed", status: "error", error: this.error });
    this.options.onError?.();
  }

  private destroyHls() {
    if (!this.hls) return;
    this.hls.destroy();
    this.hls = null;
  }

  private seekableDurationFromRange(
    video: HlsVideoElement,
    range: { start: number; end: number } | null,
  ) {
    if (range) return Math.max(0, range.end - range.start);
    if (Number.isFinite(video.duration) && video.duration > 0) {
      return video.duration;
    }
    return 0;
  }

  private getSeekableRange(video: HlsVideoElement) {
    if (video.seekable.length === 0) return null;
    const start = video.seekable.start(0);
    const end = video.seekable.end(video.seekable.length - 1);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return null;
    }
    return { start, end };
  }

  private setTime(position: number) {
    const video = this.video;
    if (!video || !Number.isFinite(position)) return;
    const range = this.getSeekableRange(video);
    if (!range) return;
    const duration = this.seekableDurationFromRange(video, range);
    if (position < 0 || position > duration) {
      this.emit({
        type: "seek_rejected",
        position,
        start: 0,
        end: duration,
      });
      return;
    }
    video.currentTime = range.start + position;
  }

  private emit(event: MediaPlayerEvent) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A view observer cannot interrupt media ownership.
      }
    }
  }

  private readonly onLoadedMetadata = () => {
    this.status = "ready";
    this.emit({ type: "status_changed", status: "ready" });
    this.emit({ type: "source_loaded" });
  };

  private readonly onCanPlay = () => {
    if (this.status !== "ready") {
      this.status = "ready";
      this.emit({ type: "status_changed", status: "ready" });
    }
  };

  private readonly onPlaying = () => {
    if (!this.firstFrameReported) {
      this.firstFrameReported = true;
      this.emit({ type: "first_frame_rendered" });
    }
    this.emit({ type: "playing_changed", playing: true });
  };

  private readonly onPause = () => {
    this.emit({ type: "playing_changed", playing: false });
  };

  private readonly onTimeUpdate = () => {
    const snapshot = this.snapshot();
    this.emit({
      type: "time_updated",
      currentTime: snapshot.currentTime,
      bufferedPosition: snapshot.bufferedPosition,
    });
  };

  private readonly onVolumeChange = () => {
    const snapshot = this.snapshot();
    this.emit({
      type: "volume_changed",
      muted: snapshot.muted,
      volume: snapshot.volume,
    });
  };

  private readonly onEnded = () => this.emit({ type: "completed" });

  private readonly onVideoError = () => {
    this.status = "error";
    this.error = {
      code: "MEDIA_ERROR",
      message: "The media stream could not be loaded.",
    };
    this.emit({ type: "status_changed", status: "error", error: this.error });
    this.options.onError?.();
  };
}
