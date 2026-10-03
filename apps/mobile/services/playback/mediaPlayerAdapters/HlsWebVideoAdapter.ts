import type {
  MediaPlayerAdapter,
  MediaPlayerCapabilities,
  MediaPlayerEvent,
  MediaPlayerEventListener,
  MediaSeekOptions,
  MediaPlayerSnapshot,
  MediaTimeRange,
  MediaPlayerThumbnail,
  MediaThumbnailOptions,
  NormalizedMediaTrack,
} from "../MediaPlayerAdapter";
import type { WebMediaDocument } from "./WebVideoAdapter";
import type { ExpoVideoPlayerLike } from "./ExpoVideoAdapterBase";
import { recordPlaybackDebugEvent } from "../playbackDebug";
import { confirmMediaSeek } from "../ConfirmedMediaSeek";

type HlsConstructor = typeof import("hls.js").default;
type HlsInstance = InstanceType<HlsConstructor>;

const HLS_RESUME_RETRY_MS = 500;
const HLS_MAX_RESUME_ATTEMPTS = 20;
const HLS_MEDIA_RESET_DEDUP_MS = 250;
const HLS_FRAGMENT_LOAD_TIMEOUT_MS = 45_000;

export function getHlsFragmentLoaderConfig() {
  return {
    fragLoadPolicy: {
      default: {
        maxTimeToFirstByteMs: HLS_FRAGMENT_LOAD_TIMEOUT_MS,
        maxLoadTimeMs: HLS_FRAGMENT_LOAD_TIMEOUT_MS,
        timeoutRetry: {
          maxNumRetry: 1,
          retryDelayMs: 1_000,
          maxRetryDelayMs: 1_000,
        },
        errorRetry: {
          maxNumRetry: 1,
          retryDelayMs: 1_000,
          maxRetryDelayMs: 1_000,
        },
      },
    },
  };
}

export interface HlsVideoElement extends HTMLVideoElement {}

export type HlsFatalErrorAction = "recover" | "fail";

/**
 * HLS.js uses this media error when a MediaSource needs to be detached and
 * attached again. It is a bounded player recovery, not evidence that the
 * selected source is unavailable. Network/manifest failures remain terminal
 * for the current source and are allowed to enter normal fallback.
 */
export function classifyHlsFatalError(data: {
  type?: string;
  details?: string;
}): HlsFatalErrorAction {
  return data.type === "mediaError" &&
    data.details === "mediaSourceRequiresReset"
    ? "recover"
    : "fail";
}

export function isHlsMediaRecoveryExhausted(resetAttempts: number) {
  return resetAttempts >= 2;
}

export function shouldCountHlsMediaReset(
  lastResetAt: number,
  now: number,
  dedupWindowMs = HLS_MEDIA_RESET_DEDUP_MS,
) {
  return lastResetAt <= 0 || now - lastResetAt >= dedupWindowMs;
}

export interface HlsPublishedFragment {
  start?: number;
  duration?: number;
}

export function getPublishedHlsWindow(
  fragments: readonly HlsPublishedFragment[] | undefined,
) {
  if (!fragments || fragments.length === 0) return null;

  const first = fragments[0];
  const last = fragments[fragments.length - 1];
  const start = first?.start;
  const end =
    last?.start !== undefined && last.duration !== undefined
      ? last.start + last.duration
      : undefined;
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    (end as number) <= (start as number)
  ) {
    return null;
  }
  return { start: start as number, end: end as number };
}

export interface HlsWebVideoAdapterOptions {
  document?: WebMediaDocument;
  onError?: () => void;
  timeOriginSeconds?: number;
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
      void adapter.commitSeek(value).catch(() => undefined);
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
    seekBy: (seconds: number) => {
      void adapter.seekBy(seconds).catch(() => undefined);
    },
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
  private readonly timeOriginSeconds: number;
  private video: HlsVideoElement | null = null;
  private hls: HlsInstance | null = null;
  private source: string | null = null;
  private status: MediaPlayerSnapshot["status"] = "idle";
  private error: { code: "MEDIA_ERROR"; message: string } | undefined;
  private firstFrameReported = false;
  private destroyed = false;
  private loadGeneration = 0;
  private seekRevision = 0;
  private publishedWindow: { start: number; end: number } | null = null;
  private vodDurationSeconds = 0;
  private isVodPlaylist = false;
  private playbackIntent = false;
  private resumeTimer: ReturnType<typeof setTimeout> | null = null;
  private resumeAttempts = 0;
  private mediaResetAttempts = 0;
  private lastMediaResetAt = 0;

  constructor(options: HlsWebVideoAdapterOptions = {}) {
    this.options = options;
    this.timeOriginSeconds =
      Number.isFinite(options.timeOriginSeconds) &&
      (options.timeOriginSeconds ?? 0) > 0
        ? options.timeOriginSeconds!
        : 0;
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
    video.addEventListener("waiting", this.onWaiting);
    video.addEventListener("stalled", this.onStalled);
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
    this.loadGeneration += 1;
    this.seekRevision += 1;
    this.source = null;
    video.removeEventListener("loadedmetadata", this.onLoadedMetadata);
    video.removeEventListener("canplay", this.onCanPlay);
    video.removeEventListener("playing", this.onPlaying);
    video.removeEventListener("pause", this.onPause);
    video.removeEventListener("waiting", this.onWaiting);
    video.removeEventListener("stalled", this.onStalled);
    video.removeEventListener("timeupdate", this.onTimeUpdate);
    video.removeEventListener("progress", this.onTimeUpdate);
    video.removeEventListener("volumechange", this.onVolumeChange);
    video.removeEventListener("ended", this.onEnded);
    video.removeEventListener("error", this.onVideoError);
    this.destroyHls();
    this.publishedWindow = null;
    this.vodDurationSeconds = 0;
    this.isVodPlaylist = false;
    this.video = null;
  }

  /**
   * Detaches the current HLS source without destroying the adapter. This is
   * used when fallback releases a gateway lease while the same video surface
   * remains mounted.
   */
  clearSource() {
    this.loadGeneration += 1;
    this.source = null;
    this.playbackIntent = false;
    this.clearResumeTimer();
    this.mediaResetAttempts = 0;
    this.lastMediaResetAt = 0;
    this.firstFrameReported = false;
    this.error = undefined;
    this.status = "idle";
    this.publishedWindow = null;
    this.vodDurationSeconds = 0;
    this.isVodPlaylist = false;
    this.seekRevision += 1;
    this.destroyHls();
    const video = this.video;
    if (!video) return;
    video.removeAttribute("src");
    video.load();
  }

  getCapabilities() {
    return { ...this.hlsVideoCapabilities };
  }

  snapshot(): MediaPlayerSnapshot {
    const video = this.video;
    const sourceSeekableRanges = video ? this.readRanges(video.seekable) : [];
    const sourceVisibleSeekableRanges =
      sourceSeekableRanges.length > 0
        ? sourceSeekableRanges
        : !this.isVodPlaylist && this.publishedWindow
          ? [this.publishedWindow]
          : [];
    const toTitleRanges = (ranges: MediaTimeRange[]) =>
      ranges.flatMap(({ start, end }) => {
        const titleRange = {
          start: Math.max(0, start - this.timeOriginSeconds),
          end: Math.max(0, end - this.timeOriginSeconds),
        };
        return titleRange.end > titleRange.start ? [titleRange] : [];
      });
    const visibleSeekableRanges = toTitleRanges(sourceVisibleSeekableRanges);
    const bufferedRanges = toTitleRanges(
      video ? this.readRanges(video.buffered) : [],
    );
    const mediaDuration =
      video && Number.isFinite(video.duration) && video.duration > 0
        ? Math.max(0, video.duration - this.timeOriginSeconds)
        : 0;
    const duration = Math.max(
      mediaDuration,
      this.vodDurationSeconds,
      ...visibleSeekableRanges.map((range) => range.end),
    );
    const currentTime = video
      ? Math.max(0, video.currentTime - this.timeOriginSeconds)
      : 0;
    const bufferedPosition = bufferedRanges.reduce(
      (latest, range) => Math.max(latest, range.end),
      0,
    );
    return {
      status: this.status,
      currentTime: Number.isFinite(currentTime) ? currentTime : 0,
      timeOriginSeconds: this.timeOriginSeconds,
      duration,
      bufferedPosition,
      bufferedRanges,
      seekableRanges: visibleSeekableRanges,
      seekableOnRequest: this.isVodPlaylist,
      playing: Boolean(video && !video.paused && !video.ended),
      muted: Boolean(video?.muted),
      volume: video ? Math.min(1, Math.max(0, video.volume)) : 1,
      playbackRate: video?.playbackRate || 1,
      canSeek:
        duration > 0 &&
        (visibleSeekableRanges.length > 0 || this.isVodPlaylist),
    };
  }

  subscribe(listener: MediaPlayerEventListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play() {
    this.playbackIntent = true;
    this.resumeAttempts = 0;
    this.tryResumePlayback();
  }

  pause() {
    this.playbackIntent = false;
    this.clearResumeTimer();
    this.video?.pause();
  }

  seekBy(seconds: number, options?: MediaSeekOptions) {
    if (!Number.isFinite(seconds)) {
      return Promise.reject(new RangeError("Seek offset must be finite."));
    }
    return this.commitSeek(this.snapshot().currentTime + seconds, options);
  }

  previewSeek(_position: number) {}

  commitSeek(position: number, options?: MediaSeekOptions) {
    const revision = ++this.seekRevision;
    return confirmMediaSeek({
      target: position,
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
      request: () => {
        if (!this.setTime(position)) {
          throw new Error(
            "The requested time is outside the seekable media range.",
          );
        }
      },
      observe: () => {
        const snapshot = this.snapshot();
        return {
          currentTime: snapshot.currentTime,
          duration: snapshot.duration,
          status: snapshot.status,
          bufferedRanges: snapshot.bufferedRanges,
        };
      },
      isCurrent: () => revision === this.seekRevision,
    });
  }

  beginScrubbing() {}

  endScrubbing({ shouldResume }: { shouldResume: boolean }) {
    if (shouldResume) this.play();
    else this.pause();
  }

  async replaceSource(source: string) {
    this.seekRevision += 1;
    this.playbackIntent = false;
    this.clearResumeTimer();
    this.source = source;
    this.firstFrameReported = false;
    this.error = undefined;
    this.mediaResetAttempts = 0;
    this.lastMediaResetAt = 0;
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
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.hls_load_started",
      data: { hasVideo: true },
    });
    this.status = "loading";
    this.emit({ type: "status_changed", status: "loading" });
    this.destroyHls();
    this.mediaResetAttempts = 0;
    this.lastMediaResetAt = 0;
    this.publishedWindow = null;
    this.vodDurationSeconds = 0;
    this.isVodPlaylist = false;
    video.removeAttribute("src");
    video.load();

    try {
      const hlsModule = await import("hls.js");
      if (generation !== this.loadGeneration || this.destroyed) return;
      const Hls = hlsModule.default;
      const hlsSupported = Hls.isSupported();
      recordPlaybackDebugEvent({
        category: "playback",
        message: "player.hls_support_checked",
        data: { supported: hlsSupported },
      });
      if (hlsSupported) {
        const hls = new Hls({
          enableWorker: false,
          lowLatencyMode: false,
          ...getHlsFragmentLoaderConfig(),
        });
        this.hls = hls;
        recordPlaybackDebugEvent({
          category: "playback",
          message: "player.hls_instance_attached",
          data: { generation },
        });
        const updatePublishedWindow = (data: {
          details?: {
            fragments?: readonly HlsPublishedFragment[];
            live?: boolean;
            totalduration?: number;
          };
        }) => {
          if (generation !== this.loadGeneration) return;
          const nextWindow = getPublishedHlsWindow(data.details?.fragments);
          if (!nextWindow) return;
          this.publishedWindow = nextWindow;
          if (data.details?.live === false) {
            this.isVodPlaylist = true;
            if (
              typeof data.details.totalduration === "number" &&
              Number.isFinite(data.details.totalduration) &&
              data.details.totalduration > 0
            ) {
              this.vodDurationSeconds = data.details.totalduration;
            }
          }
          this.onTimeUpdate();
          this.tryResumePlayback();
        };
        hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.hls_level_loaded",
            data: {
              generation,
              fragmentCount: Array.isArray(data?.details?.fragments)
                ? data.details.fragments.length
                : 0,
              durationSeconds:
                typeof data?.details?.totalduration === "number"
                  ? Math.max(0, Math.min(86_400, data.details.totalduration))
                  : undefined,
              live: data?.details?.live === true,
            },
          });
          updatePublishedWindow(data);
        });
        hls.on(Hls.Events.LEVEL_UPDATED, (_event, data) => {
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.hls_level_updated",
            data: {
              generation,
              fragmentCount: Array.isArray(data?.details?.fragments)
                ? data.details.fragments.length
                : 0,
              durationSeconds:
                typeof data?.details?.totalduration === "number"
                  ? Math.max(0, Math.min(86_400, data.details.totalduration))
                  : undefined,
              live: data?.details?.live === true,
            },
          });
          updatePublishedWindow(data);
        });
        hls.on(Hls.Events.FRAG_LOADED, (_event, data) => {
          if (generation !== this.loadGeneration) return;
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.hls_fragment_loaded",
            data: {
              generation,
              sequence:
                typeof data?.frag?.sn === "number" ? data.frag.sn : undefined,
              durationSeconds:
                typeof data?.frag?.duration === "number"
                  ? Math.max(0, Math.min(86_400, data.frag.duration))
                  : undefined,
            },
          });
        });
        hls.on(Hls.Events.FRAG_BUFFERED, (_event, data) => {
          if (generation !== this.loadGeneration) return;
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.hls_fragment_buffered",
            data: {
              generation,
              sequence:
                typeof data?.frag?.sn === "number" ? data.frag.sn : undefined,
            },
          });
          this.tryResumePlayback();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          const hlsError =
            data && typeof data.error === "object" && data.error !== null
              ? (data.error as { code?: unknown })
              : undefined;
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.hls_error_observed",
            level: data?.fatal ? "warning" : "info",
            data: {
              generation,
              fatal: data?.fatal === true,
              sourceBuffer:
                typeof data?.sourceBufferName === "string"
                  ? data.sourceBufferName.slice(0, 20)
                  : undefined,
              errorType:
                typeof data?.type === "string"
                  ? data.type.slice(0, 40)
                  : undefined,
              errorDetails:
                typeof data?.details === "string"
                  ? data.details.slice(0, 60)
                  : undefined,
              errorCode:
                typeof hlsError?.code === "number"
                  ? Math.max(0, Math.min(10_000, hlsError.code))
                  : undefined,
              errorName:
                typeof data?.error?.name === "string"
                  ? data.error.name.slice(0, 40)
                  : undefined,
              errorMessage:
                typeof data?.error?.message === "string"
                  ? data.error.message
                      .replace(/https?:\/\/\S+/gi, "[redacted]")
                      .slice(0, 120)
                  : undefined,
              responseCode:
                typeof data?.response?.code === "number"
                  ? data.response.code
                  : undefined,
            },
          });
          if (
            !data?.fatal ||
            generation !== this.loadGeneration ||
            this.destroyed ||
            this.hls !== hls
          ) {
            return;
          }
          const action = classifyHlsFatalError({
            type: typeof data?.type === "string" ? data.type : undefined,
            details:
              typeof data?.details === "string" ? data.details : undefined,
          });
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.hls_fatal_error",
            level: "warning",
            data: {
              generation,
              errorType:
                typeof data?.type === "string"
                  ? data.type.slice(0, 40)
                  : undefined,
              errorDetails:
                typeof data?.details === "string"
                  ? data.details.slice(0, 60)
                  : undefined,
              responseCode:
                typeof data?.response?.code === "number"
                  ? data.response.code
                  : undefined,
              action,
            },
          });
          // HLS.js already owns the bounded detach/attach recovery for this
          // error. Calling recoverMediaError here as well races its internal
          // recovery and can invalidate the signed manifest, which then
          // appears to the app as a misleading 410 fallback.
          if (action === "recover") {
            const resetAt = Date.now();
            const countReset = shouldCountHlsMediaReset(
              this.lastMediaResetAt,
              resetAt,
            );
            recordPlaybackDebugEvent({
              category: "playback",
              message: "player.hls_media_reset_observed",
              data: {
                generation,
                countReset,
              },
            });
            if (!countReset) return;
            this.lastMediaResetAt = resetAt;
            this.mediaResetAttempts += 1;
            if (!isHlsMediaRecoveryExhausted(this.mediaResetAttempts)) {
              return;
            }
            this.status = "error";
            this.error = {
              code: "MEDIA_ERROR",
              message: "The HLS media source could not be recovered.",
            };
            this.emit({
              type: "status_changed",
              status: "error",
              error: this.error,
            });
            this.options.onError?.();
            return;
          }
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
          recordPlaybackDebugEvent({
            category: "playback",
            message: "player.hls_manifest_parsed",
            data: { generation },
          });
          this.emit({ type: "source_loaded" });
        });
        hls.loadSource(source);
        hls.attachMedia(video);
        return;
      }
    } catch {
      recordPlaybackDebugEvent({
        category: "playback",
        message: "player.hls_module_unavailable",
        level: "warning",
        data: { reason: "module_or_runtime_error" },
      });
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
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.hls_unsupported",
      level: "warning",
      data: { nativeSupport: false },
    });
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

  private clearResumeTimer() {
    if (!this.resumeTimer) return;
    clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
  }

  /**
   * A live HLS playlist can briefly exhaust the media element's buffer while
   * the torrent-backed remux catches up. Browsers may transition the element
   * to paused in that case instead of resuming it when the next fragment is
   * appended. Keep the user's play intent and retry only on a bounded timer;
   * an explicit pause clears the intent and cancels this path.
   */
  private tryResumePlayback() {
    const video = this.video;
    if (
      !video ||
      !this.playbackIntent ||
      this.destroyed ||
      video.ended ||
      !video.paused
    ) {
      return;
    }

    void Promise.resolve(video.play()).catch(() => {
      this.scheduleResumePlayback();
    });
  }

  private scheduleResumePlayback() {
    if (
      !this.playbackIntent ||
      this.resumeTimer ||
      this.resumeAttempts >= HLS_MAX_RESUME_ATTEMPTS
    ) {
      return;
    }
    this.resumeAttempts += 1;
    this.resumeTimer = setTimeout(() => {
      this.resumeTimer = null;
      if (!this.playbackIntent) return;
      this.tryResumePlayback();
      if (this.video?.paused && this.playbackIntent) {
        this.scheduleResumePlayback();
      }
    }, HLS_RESUME_RETRY_MS);
  }

  private readRanges(source: TimeRanges): MediaTimeRange[] {
    const ranges: MediaTimeRange[] = [];
    for (let index = 0; index < source.length; index += 1) {
      const start = source.start(index);
      const end = source.end(index);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        ranges.push({ start, end });
      }
    }
    return ranges;
  }

  private setTime(position: number) {
    const video = this.video;
    if (!video || !Number.isFinite(position)) return false;
    const snapshot = this.snapshot();
    const inPublishedRange = snapshot.seekableRanges.some(
      ({ start, end }) => position >= start && position <= end,
    );
    if (
      position < 0 ||
      position > snapshot.duration ||
      (!inPublishedRange && !this.isVodPlaylist)
    ) {
      this.emit({
        type: "seek_rejected",
        position,
        start: snapshot.seekableRanges[0]?.start ?? 0,
        end:
          snapshot.seekableRanges[snapshot.seekableRanges.length - 1]?.end ??
          snapshot.duration,
      });
      return false;
    }
    video.currentTime = position + this.timeOriginSeconds;
    return true;
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
    const video = this.video;
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.video_loaded_metadata",
      data: {
        readyState: video?.readyState,
        durationSeconds:
          typeof video?.duration === "number" && Number.isFinite(video.duration)
            ? Math.max(0, Math.min(86_400, video.duration))
            : undefined,
        videoWidth: video?.videoWidth,
        videoHeight: video?.videoHeight,
      },
    });
    this.status = "ready";
    this.emit({ type: "status_changed", status: "ready" });
    this.emit({ type: "source_loaded" });
  };

  private readonly onCanPlay = () => {
    const video = this.video;
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.video_can_play",
      data: {
        readyState: video?.readyState,
        videoWidth: video?.videoWidth,
        videoHeight: video?.videoHeight,
      },
    });
    if (this.status !== "ready") {
      this.status = "ready";
      this.emit({ type: "status_changed", status: "ready" });
    }
    this.tryResumePlayback();
  };

  private readonly onPlaying = () => {
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.video_playing",
      data: { readyState: this.video?.readyState },
    });
    if (!this.firstFrameReported) {
      this.firstFrameReported = true;
      this.emit({ type: "first_frame_rendered" });
    }
    this.emit({ type: "playing_changed", playing: true });
  };

  private readonly onPause = () => {
    if (this.playbackIntent && !this.video?.ended) {
      this.scheduleResumePlayback();
      return;
    }
    this.emit({ type: "playing_changed", playing: false });
  };

  private readonly onWaiting = () => {
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.video_waiting",
      data: { readyState: this.video?.readyState },
    });
    this.scheduleResumePlayback();
  };

  private readonly onStalled = () => {
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.video_stalled",
      level: "warning",
      data: { readyState: this.video?.readyState },
    });
    this.scheduleResumePlayback();
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

  private readonly onEnded = () => {
    this.playbackIntent = false;
    this.clearResumeTimer();
    this.emit({ type: "completed" });
  };

  private readonly onVideoError = () => {
    if (!this.source || this.destroyed) return;
    recordPlaybackDebugEvent({
      category: "playback",
      message: "player.video_error",
      level: "warning",
      data: {
        readyState: this.video?.readyState,
        errorCode: this.video?.error?.code,
      },
    });
    // When HLS.js owns the MediaSource, Chromium may emit a video-element
    // error while HLS.js is still applying its own level/recovery action. The
    // HLS error event is the authoritative lifecycle signal in that mode;
    // turning this transient DOM event into a source failure races recovery
    // and releases the signed gateway job too early.
    if (this.hls) {
      recordPlaybackDebugEvent({
        category: "playback",
        message: "player.hls_video_error_deferred",
        level: "warning",
        data: { reason: "hls_controller_active" },
      });
      return;
    }
    this.status = "error";
    this.error = {
      code: "MEDIA_ERROR",
      message: "The media stream could not be loaded.",
    };
    this.emit({ type: "status_changed", status: "error", error: this.error });
    this.options.onError?.();
  };
}
