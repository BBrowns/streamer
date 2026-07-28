import type { PlaybackGatewayPhase, Stream } from "@streamer/shared";

export class StreamEngineCancellationError extends Error {
  readonly code = "STREAM_ENGINE_CANCELLED";
  readonly isCancellation = true;

  constructor(message = "Stream preparation was cancelled.") {
    super(message);
    this.name = "StreamEngineCancellationError";
  }
}

export function isStreamEngineCancellationError(
  error: unknown,
): error is StreamEngineCancellationError {
  return (
    error instanceof StreamEngineCancellationError ||
    (!!error &&
      typeof error === "object" &&
      ((error as { code?: unknown }).code === "STREAM_ENGINE_CANCELLED" ||
        (error as { isCancellation?: unknown }).isCancellation === true))
  );
}

/** Audio track descriptor */
export interface AudioTrack {
  id: string;
  label: string;
  language: string;
  active: boolean;
}

/** Subtitle track descriptor */
export interface SubtitleTrack {
  id: string;
  label: string;
  language: string;
  active: boolean;
}

/** Real-time streaming stats (for torrent engine) */
export interface StreamStats {
  speed: number; // bytes/sec download speed
  peers: number; // number of connected peers
}

export interface GatewayJobProgress {
  id?: string;
  state?:
    | "preparing"
    | "ready"
    | "no_peers"
    | "stalled"
    | "error"
    | "cancelled"
    | "expired";
  phase?: PlaybackGatewayPhase;
  /**
   * A determinate readiness value only. Gateway preparation normally leaves
   * this null rather than presenting elapsed time as media progress.
   */
  progress?: number | null;
  peerCount?: number | null;
  error?: string;
  retryable?: boolean;
  elapsedMs?: number;
  readyTimeoutMs?: number;
}

/**
 * Runtime-only status for a progressive torrent stream that is being
 * materialized into a range-seekable MP4 in the background. The URI, when
 * present, is signed and deliberately never belongs in persisted playback
 * session state.
 */
export interface SeekablePlaybackHandoff {
  gatewayJobId?: string;
  status: "not_started" | "evaluating" | "preparing" | "ready" | "unavailable";
  unavailableReason?:
    | "source_too_large"
    | "insufficient_storage"
    | "no_download_progress"
    | "remux_failed"
    | "timed_out"
    | "cancelled";
  uri?: string;
}

/** Event map for stream engine events */
export interface StreamEngineEventMap {
  stats: StreamStats;
  gateway: GatewayJobProgress;
}

/**
 * Strategy Pattern interface for stream engines.
 * The MVP implements HLSEngine. A TorrentEngine can be added later
 * without modifying existing code.
 */
export interface IStreamEngine {
  /** Check if this engine can handle the given stream */
  canPlay(stream: Stream): boolean;

  /** Get the playback URI for the stream */
  getPlaybackUri(stream: Stream): Promise<string>;

  /**
   * Return a replacement URI once a progressive gateway stream has finished
   * materializing a seekable cache. Engines that do not support a handoff do
   * not implement this optional capability.
   */
  getSeekablePlaybackHandoff?(options?: {
    expectedGatewayJobId?: string;
    signal?: AbortSignal;
  }): Promise<SeekablePlaybackHandoff>;

  /** Get the engine type identifier */
  getEngineType(): string;

  /** Get available audio tracks */
  getAudioTracks(): AudioTrack[];

  /** Switch to a specific audio track */
  setAudioTrack(id: string): void;

  /** Get available subtitle tracks */
  getSubtitles(): SubtitleTrack[];

  /** Enable/switch subtitle track (pass null to disable) */
  setSubtitle(id: string | null): void;

  /** Subscribe to engine events (e.g. torrent stats) */
  on<K extends keyof StreamEngineEventMap>(
    event: K,
    callback: (data: StreamEngineEventMap[K]) => void,
  ): void;

  /** Unsubscribe from engine events */
  off<K extends keyof StreamEngineEventMap>(
    event: K,
    callback: (data: StreamEngineEventMap[K]) => void,
  ): void;

  /** Stop and cleanup the engine (optional) */
  stop?(): void;
}
