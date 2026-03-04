import type { Stream } from "@streamer/shared";
import type { AudioTrack, IStreamEngine, SubtitleTrack } from "./IStreamEngine";

export class HttpVideoEngine implements IStreamEngine {
  private listeners = new Map<string, Set<Function>>();

  canPlay(stream: Stream): boolean {
    // Fallback for ANY string url that looks like a web link
    if (!stream.url) return false;

    const url = stream.url.toLowerCase();
    return url.startsWith("http://") || url.startsWith("https://");
  }

  async getPlaybackUri(stream: Stream): Promise<string> {
    return stream.url || "";
  }

  getEngineType(): string {
    return "http-video";
  }

  // Pass-through track stubs
  getAudioTracks(): AudioTrack[] {
    return [];
  }

  setAudioTrack(id: string): void {}

  getSubtitles(): SubtitleTrack[] {
    return [];
  }

  setSubtitle(id: string | null): void {}

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
  }

  destroy(): void {
    this.listeners.clear();
  }
}
