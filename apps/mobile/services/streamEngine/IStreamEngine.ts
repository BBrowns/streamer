import type { Stream } from "@streamer/shared";

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

/** Event map for stream engine events */
export interface StreamEngineEventMap {
  stats: StreamStats;
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
  getPlaybackUri(stream: Stream): string;

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
