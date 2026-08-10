import { redactSentryBreadcrumbText } from "@streamer/shared";
import type {
  MediaPlayerAdapter,
  MediaPlayerCapabilities,
  MediaPlayerEvent,
  MediaPlayerEventListener,
  MediaPlayerSnapshot,
  MediaPlayerTarget,
  MediaPlayerThumbnail,
  MediaThumbnailOptions,
  NormalizedMediaTrack,
} from "../MediaPlayerAdapter";

export interface ExpoMediaTrackLike {
  id?: string | null;
  language?: string | null;
  label?: string | null;
  name?: string | null;
  isDefault?: boolean;
  autoSelect?: boolean;
}

export interface ExpoVideoPlayerLike {
  status?: string;
  currentTime: number;
  duration?: number;
  bufferedPosition?: number;
  playing?: boolean;
  muted?: boolean;
  volume?: number;
  playbackRate?: number;
  seekTolerance?: unknown;
  scrubbingModeOptions?: unknown;
  availableAudioTracks?: ExpoMediaTrackLike[];
  availableSubtitleTracks?: ExpoMediaTrackLike[];
  audioTrack?: ExpoMediaTrackLike | null;
  subtitleTrack?: ExpoMediaTrackLike | null;
  play(): void;
  pause(): void;
  seekBy(seconds: number): void;
  replaceAsync(source: string): Promise<void>;
  generateThumbnailsAsync?(
    times: number[],
    options?: MediaThumbnailOptions,
  ): Promise<MediaPlayerThumbnail[]>;
  addListener?(
    event: string,
    listener: (payload?: Record<string, unknown>) => void,
  ): { remove?: () => void } | undefined;
}

function normalizeStatus(
  status: string | undefined,
): MediaPlayerSnapshot["status"] {
  if (status === "loading") return "loading";
  if (status === "readyToPlay") return "ready";
  if (status === "error") return "error";
  return "idle";
}

function normalizedNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function trackId(track: ExpoMediaTrackLike, index: number) {
  if (track.id) return track.id;
  const descriptor = `${track.language || "unknown"}:${
    track.label || track.name || "unknown"
  }`;
  return `${descriptor}:${index}`;
}

function normalizeTracks(
  kind: NormalizedMediaTrack["kind"],
  tracks: ExpoMediaTrackLike[],
  activeTrack: ExpoMediaTrackLike | null | undefined,
): NormalizedMediaTrack[] {
  const activeIndex = activeTrack
    ? tracks.findIndex(
        (track) =>
          track === activeTrack ||
          (!!activeTrack.id && track.id === activeTrack.id),
      )
    : -1;
  const activeId =
    activeIndex >= 0 ? trackId(tracks[activeIndex], activeIndex) : null;
  return tracks.map((track, index) => ({
    id: trackId(track, index),
    kind,
    language: track.language?.trim().toLowerCase() || "unknown",
    label:
      track.label ||
      track.name ||
      track.language?.trim().toUpperCase() ||
      "Unknown",
    active: activeId === trackId(track, index),
    isDefault: Boolean(track.isDefault),
    autoSelect: Boolean(track.autoSelect),
  }));
}

function sanitizeMediaErrorMessage(value: unknown) {
  const raw =
    typeof value === "string" && value.trim()
      ? value.trim()
      : "Media playback failed.";
  return redactSentryBreadcrumbText(raw)
    .replace(
      /\b(?:file|content|blob|data|streamer):[^\s"'<>]+/gi,
      "[redacted media]",
    )
    .slice(0, 512);
}

function toMediaEventError(payload?: Record<string, unknown>) {
  const error = payload?.error;
  const message =
    error && typeof error === "object" && "message" in error
      ? (error as { message?: unknown }).message
      : undefined;
  return {
    code: "MEDIA_ERROR" as const,
    message: sanitizeMediaErrorMessage(message),
  };
}

export abstract class ExpoVideoAdapterBase implements MediaPlayerAdapter {
  protected constructor(
    protected readonly player: ExpoVideoPlayerLike,
    private readonly target: MediaPlayerTarget,
  ) {}

  protected abstract platformCapabilities(): Omit<
    MediaPlayerCapabilities,
    "target" | "sourceReplacement"
  >;

  getCapabilities(): MediaPlayerCapabilities {
    return {
      target: this.target,
      sourceReplacement: true,
      ...this.platformCapabilities(),
    };
  }

  snapshot(): MediaPlayerSnapshot {
    const duration = normalizedNumber(this.player.duration);
    return {
      status: normalizeStatus(this.player.status),
      currentTime: normalizedNumber(this.player.currentTime),
      duration,
      bufferedPosition: normalizedNumber(this.player.bufferedPosition),
      playing: Boolean(this.player.playing),
      muted: Boolean(this.player.muted),
      volume: Math.min(1, Math.max(0, normalizedNumber(this.player.volume, 1))),
      playbackRate: normalizedNumber(this.player.playbackRate, 1),
      canSeek: duration > 0,
    };
  }

  subscribe(listener: MediaPlayerEventListener) {
    const subscriptions: Array<{ remove?: () => void } | undefined> = [];
    const add = (
      event: string,
      handler: (payload?: Record<string, unknown>) => MediaPlayerEvent,
    ) => {
      subscriptions.push(
        this.player.addListener?.(event, (payload) =>
          listener(handler(payload)),
        ),
      );
    };

    add("statusChange", (payload) => {
      const status = normalizeStatus(
        typeof payload?.status === "string" ? payload.status : undefined,
      );
      return status === "error"
        ? {
            type: "status_changed",
            status,
            error: toMediaEventError(payload),
          }
        : { type: "status_changed", status };
    });
    add("playingChange", (payload) => ({
      type: "playing_changed",
      playing: Boolean(payload?.isPlaying),
    }));
    add("timeUpdate", (payload) => ({
      type: "time_updated",
      currentTime: normalizedNumber(
        payload?.currentTime,
        this.snapshot().currentTime,
      ),
      bufferedPosition: this.snapshot().bufferedPosition,
    }));
    add("sourceLoad", () => ({ type: "source_loaded" }));
    for (const event of [
      "availableAudioTracksChange",
      "audioTrackChange",
      "availableSubtitleTracksChange",
      "subtitleTrackChange",
    ]) {
      add(event, () => ({ type: "tracks_changed" }));
    }
    for (const event of ["volumeChange", "mutedChange"]) {
      add(event, () => ({
        type: "volume_changed",
        muted: this.snapshot().muted,
        volume: this.snapshot().volume,
      }));
    }
    add("playToEnd", () => ({ type: "completed" }));

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      for (const subscription of subscriptions) subscription?.remove?.();
    };
  }

  play() {
    this.player.play();
  }

  pause() {
    this.player.pause();
  }

  seekBy(seconds: number) {
    if (!Number.isFinite(seconds)) return;
    this.player.seekBy(seconds);
  }

  previewSeek(position: number) {
    if (!Number.isFinite(position) || position < 0) return;
    this.player.currentTime = position;
  }

  commitSeek(position: number) {
    if (!Number.isFinite(position) || position < 0) return;
    this.player.currentTime = position;
  }

  beginScrubbing() {}

  endScrubbing({ shouldResume }: { shouldResume: boolean }) {
    if (shouldResume) this.player.play();
    else this.player.pause();
  }

  replaceSource(source: string) {
    return this.player.replaceAsync(source);
  }

  setPlaybackRate(rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) return false;
    this.player.playbackRate = rate;
    return true;
  }

  setMuted(muted: boolean) {
    if (!this.getCapabilities().playerVolume) return false;
    this.player.muted = muted;
    return true;
  }

  setVolume(volume: number) {
    if (!this.getCapabilities().playerVolume || !Number.isFinite(volume)) {
      return false;
    }
    this.player.volume = Math.min(1, Math.max(0, volume));
    return true;
  }

  getAudioTracks() {
    if (!this.getCapabilities().audioTracks) return [];
    return normalizeTracks(
      "audio",
      this.player.availableAudioTracks || [],
      this.player.audioTrack,
    );
  }

  getSubtitleTracks() {
    if (!this.getCapabilities().embeddedSubtitles) return [];
    return normalizeTracks(
      "subtitle",
      this.player.availableSubtitleTracks || [],
      this.player.subtitleTrack,
    );
  }

  selectAudioTrack(id: string) {
    if (!this.getCapabilities().audioTracks) return false;
    const tracks = this.player.availableAudioTracks || [];
    const index = tracks.findIndex(
      (track, trackIndex) => trackId(track, trackIndex) === id,
    );
    if (index < 0) return false;
    this.player.audioTrack = tracks[index];
    return true;
  }

  selectSubtitleTrack(id: string | null) {
    if (!this.getCapabilities().embeddedSubtitles) return false;
    if (id === null) {
      this.player.subtitleTrack = null;
      return true;
    }
    const tracks = this.player.availableSubtitleTracks || [];
    const index = tracks.findIndex(
      (track, trackIndex) => trackId(track, trackIndex) === id,
    );
    if (index < 0) return false;
    this.player.subtitleTrack = tracks[index];
    return true;
  }

  async generateThumbnails(
    _times: number[],
    _options?: MediaThumbnailOptions,
  ): Promise<MediaPlayerThumbnail[]> {
    return [];
  }

  async requestFullscreen() {
    return false;
  }

  async requestPictureInPicture() {
    return false;
  }
}
