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
  progress?: number | null;
  peerCount?: number | null;
  error?: string;
  retryable?: boolean;
  elapsedMs?: number;
  readyTimeoutMs?: number;
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
