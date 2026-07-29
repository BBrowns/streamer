import type {
  AudioTrack as ExpoAudioTrack,
  SubtitleTrack as ExpoSubtitleTrack,
  VideoPlayer,
  VideoThumbnail,
} from "expo-video";

export type MediaAdapterPlatform = "ios" | "android" | "web";
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

export interface MediaPlayerAdapter {
  snapshot(): MediaPlayerSnapshot;
  play(): void;
  pause(): void;
  seekBy(seconds: number): void;
  previewSeek(position: number): void;
  commitSeek(position: number): void;
  beginScrubbing(): void;
  endScrubbing(options: { shouldResume: boolean }): void;
  replaceSource(source: string): Promise<void>;
  getAudioTracks(): NormalizedMediaTrack[];
  getSubtitleTracks(): NormalizedMediaTrack[];
  selectAudioTrack(id: string): boolean;
  selectSubtitleTrack(id: string | null): boolean;
  generateThumbnails(
    times: number[],
    options?: { maxWidth?: number; maxHeight?: number },
  ): Promise<VideoThumbnail[]>;
}

function normalizeStatus(status: string | undefined): MediaAdapterStatus {
  if (status === "loading") return "loading";
  if (status === "readyToPlay") return "ready";
  if (status === "error") return "error";
  return "idle";
}

function normalizedNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function trackId(track: ExpoAudioTrack | ExpoSubtitleTrack, index: number) {
  return (
    track.id ||
    `${track.language || "unknown"}:${track.label || track.name || index}`
  );
}

function normalizeTracks(
  kind: NormalizedMediaTrack["kind"],
  tracks: (ExpoAudioTrack | ExpoSubtitleTrack)[],
  activeTrack: ExpoAudioTrack | ExpoSubtitleTrack | null,
): NormalizedMediaTrack[] {
  const activeId = activeTrack ? trackId(activeTrack, -1) : null;
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

/**
 * The only application-facing wrapper around expo-video. Platform-specific
 * scrubbing and thumbnail behavior lives here instead of leaking into the
 * composition screen.
 */
export class ExpoMediaPlayerAdapter implements MediaPlayerAdapter {
  constructor(
    private readonly player: VideoPlayer,
    private readonly platform: MediaAdapterPlatform,
  ) {}

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

  beginScrubbing() {
    if (this.platform === "ios") this.player.pause();
    if (this.platform !== "web") {
      this.player.scrubbingModeOptions = {
        scrubbingModeEnabled: true,
        increaseCodecOperatingRate: true,
      };
      this.player.seekTolerance = {
        toleranceBefore: 1,
        toleranceAfter: 1,
      };
    }
  }

  previewSeek(position: number) {
    if (!Number.isFinite(position) || position < 0) return;
    this.player.currentTime = position;
  }

  commitSeek(position: number) {
    if (!Number.isFinite(position) || position < 0) return;
    if (this.platform !== "web") {
      this.player.seekTolerance = {
        toleranceBefore: 0,
        toleranceAfter: 0,
      };
    }
    this.player.currentTime = position;
  }

  endScrubbing({ shouldResume }: { shouldResume: boolean }) {
    if (this.platform !== "web") {
      this.player.scrubbingModeOptions = {
        scrubbingModeEnabled: false,
      };
      this.player.seekTolerance = {
        toleranceBefore: 0,
        toleranceAfter: 0,
      };
    }
    if (shouldResume) this.player.play();
    else this.player.pause();
  }

  replaceSource(source: string) {
    return this.player.replaceAsync(source);
  }

  getAudioTracks() {
    return normalizeTracks(
      "audio",
      this.player.availableAudioTracks || [],
      this.player.audioTrack,
    );
  }

  getSubtitleTracks() {
    return normalizeTracks(
      "subtitle",
      this.player.availableSubtitleTracks || [],
      this.player.subtitleTrack,
    );
  }

  selectAudioTrack(id: string) {
    const tracks = this.player.availableAudioTracks || [];
    const index = tracks.findIndex(
      (track, trackIndex) => trackId(track, trackIndex) === id,
    );
    if (index < 0) return false;
    this.player.audioTrack = tracks[index];
    return true;
  }

  selectSubtitleTrack(id: string | null) {
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
    times: number[],
    options?: { maxWidth?: number; maxHeight?: number },
  ) {
    if (
      this.platform === "web" ||
      typeof this.player.generateThumbnailsAsync !== "function" ||
      times.length === 0
    ) {
      return [];
    }
    return this.player.generateThumbnailsAsync(times, options);
  }
}
