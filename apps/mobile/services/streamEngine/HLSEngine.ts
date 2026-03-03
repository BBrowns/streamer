import type { Stream } from "@streamer/shared";
import type {
  IStreamEngine,
  AudioTrack,
  SubtitleTrack,
  StreamEngineEventMap,
} from "./IStreamEngine";

/**
 * HLS/HTTP stream engine.
 * Handles .m3u8 playlists and direct HTTP video URLs.
 *
 * Track management and event methods are implemented as stubs
 * so the UI can be built now. A future TorrentEngine will
 * provide real implementations.
 */
export class HLSEngine implements IStreamEngine {
  private listeners = new Map<string, Set<Function>>();

  canPlay(stream: Stream): boolean {
    if (!stream.url) return false;

    const url = stream.url.toLowerCase();
    return (
      url.includes(".m3u8") ||
      url.startsWith("http://") ||
      url.startsWith("https://")
    );
  }

  getPlaybackUri(stream: Stream): string {
    return stream.url || "";
  }

  getEngineType(): string {
    return "hls";
  }

  // --- Track management stubs ---

  getAudioTracks(): AudioTrack[] {
    // HLS track selection is handled by the native player.
    // A real implementation would query the player for available tracks.
    return [];
  }

  setAudioTrack(_id: string): void {
    // Stub — native HLS player handles this
  }

  getSubtitles(): SubtitleTrack[] {
    // Stub — no subtitle tracks available in basic HLS mode
    return [];
  }

  setSubtitle(_id: string | null): void {
    // Stub — native HLS player handles this
  }

  // --- Event listener pattern ---

  on<K extends keyof StreamEngineEventMap>(
    event: K,
    callback: (data: StreamEngineEventMap[K]) => void,
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<K extends keyof StreamEngineEventMap>(
    event: K,
    callback: (data: StreamEngineEventMap[K]) => void,
  ): void {
    this.listeners.get(event)?.delete(callback);
  }

  /** Emit an event (used internally, or by a future subclass) */
  protected emit<K extends keyof StreamEngineEventMap>(
    event: K,
    data: StreamEngineEventMap[K],
  ): void {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }
}
